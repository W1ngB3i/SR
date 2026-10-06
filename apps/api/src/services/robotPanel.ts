import {
  BizCode,
  type RobotPanelDTO,
  type RobotPanelItemDTO,
  type RobotPanelOverviewDTO,
  type RobotPanelScope,
  type RobotPanelSyncResultDTO,
} from '@sr/shared';
import { getDb } from '../db/index.js';
import { ApiError } from '../lib/errors.js';
import { isRobotConfigured } from '../env.js';
import { writeAudit, type AuditActor } from './audit.js';
import {
  applyEntryLink,
  createRobotPanel,
  deleteRobotPanel as deletePlatformPanel,
  listRobotPanels,
  updateRobotPanel,
  updateRobotPanelTargets,
  type QQPanelRecord,
} from './qq.js';
import { PANEL_COMMANDS, PANEL_LINK_ITEM } from './robot.js';

/**
 * QQ 指令面板（/v2/panels）的下发与维护。
 * 管理端快捷菜单只对单聊生效，群聊要展示指令只能走 API 面板，因此统一由后台下发：
 * 单聊面板全量生效，群聊面板精准投放到「已绑定审核员所在的群」。
 * 面板元素与指令分发器共用同一份指令词表（PANEL_COMMANDS），避免「面板里点了没反应」。
 */

/** 面板备注：作为在平台侧识别「本系统下发的面板」的标记 */
const PANEL_REMARK: Record<RobotPanelScope, string> = {
  c2c: 'SR 审核工单系统 · 单聊面板',
  group: 'SR 审核工单系统 · 群聊面板',
};

const SCOPES: RobotPanelScope[] = ['c2c', 'group'];

/** 待下发的面板元素：8 个指令 + 1 个跳网站兜底链接 */
export function panelItems(): RobotPanelItemDTO[] {
  return [
    ...PANEL_COMMANDS.map((command) => ({
      type: 'command' as const,
      name: command.name,
      desc: command.desc,
    })),
    {
      type: 'link' as const,
      name: PANEL_LINK_ITEM.name,
      desc: PANEL_LINK_ITEM.desc,
      link: applyEntryLink(),
    },
  ];
}

/** 群聊面板的投放范围：已绑定审核员所在的群（即自有审核群），去重后稳定排序 */
function knownGroupOpenids(): string[] {
  return (
    getDb()
      .prepare(`SELECT DISTINCT guild_id FROM robot_identities WHERE guild_id <> '' ORDER BY guild_id`)
      .all() as { guild_id: string }[]
  ).map((row) => row.guild_id);
}

/** 按备注找回本系统之前下发的面板（以平台数据为准，避免本地登记与平台不一致） */
async function findPlatformPanel(scope: RobotPanelScope): Promise<QQPanelRecord | null> {
  const records = await listRobotPanels(scope);
  return records.find((record) => record.panel?.remark === PANEL_REMARK[scope]) ?? null;
}

function toPanelDTO(record: QQPanelRecord, scope: RobotPanelScope): RobotPanelDTO {
  return {
    scope,
    panel_id: record.panel_id,
    item_count: record.panel?.items?.length ?? 0,
    updated_at: record.updated_at ?? '',
  };
}

/** 平台错误码 40030006：指令面板不存在（多半是在 q.qq.com 手工删掉了） */
function isPanelMissing(err: unknown): boolean {
  return err instanceof Error && /40030006|面板不存在/.test(err.message);
}

/** 平台限制单次最多关联 20 个群，超出部分需要再调关联对象接口补齐 */
const TARGETS_PER_REQUEST = 20;

/** 面板概览：未配置凭据时不去请求平台，只返回本地定义 */
export async function robotPanelOverview(): Promise<RobotPanelOverviewDTO> {
  const groupOpenids = knownGroupOpenids();
  if (!isRobotConfigured()) {
    return { configured: false, items: panelItems(), panels: [], group_openids: groupOpenids };
  }
  const panels: RobotPanelDTO[] = [];
  for (const scope of SCOPES) {
    const record = await findPlatformPanel(scope);
    if (record) panels.push(toPanelDTO(record, scope));
  }
  return { configured: true, items: panelItems(), panels, group_openids: groupOpenids };
}

/**
 * 下发 / 更新面板。单聊面板就地更新即可；群聊面板的关联群必须与当前审核群完全一致，
 * 而平台没有「查询已关联群」的接口，故先删后建，保证不会残留早已退出的旧群。
 */
export async function syncRobotPanels(actor: AuditActor): Promise<RobotPanelSyncResultDTO> {
  if (!isRobotConfigured()) {
    throw ApiError.badRequest(BizCode.InvalidInput, '机器人凭据未配置，无法下发指令面板');
  }
  const items = panelItems();
  const notes: string[] = [];

  await upsertC2CPanel(items);

  const groups = knownGroupOpenids();
  if (groups.length === 0) {
    notes.push('未找到已绑定审核员所在的群，群聊面板已跳过；请先让审核员在群内发送后台认证 ID');
  } else {
    await rebuildGroupPanel(items, groups);
    notes.push(`群聊面板已投放到 ${groups.length} 个群`);
  }

  writeAudit({
    operator: actor,
    action: 'robot_panel.sync',
    resource: 'robot_panel',
    targetId: 'panels',
    after: JSON.stringify({ group_openids: groups }),
    detail: `下发 QQ 指令面板（单聊 + ${groups.length} 个群）`,
  });
  return { ...(await robotPanelOverview()), notes };
}

/** 单聊面板：全量生效、无关联群，直接就地更新 */
async function upsertC2CPanel(items: RobotPanelItemDTO[]): Promise<void> {
  const create = () =>
    createRobotPanel({
      scope: 'c2c',
      targetType: 'all',
      panel: { items, remark: PANEL_REMARK.c2c },
    });
  const existing = await findPlatformPanel('c2c');
  if (!existing) {
    await create();
    return;
  }
  try {
    await updateRobotPanel(existing.panel_id, { items, remark: PANEL_REMARK.c2c });
  } catch (err) {
    if (!isPanelMissing(err)) throw err;
    await create();
  }
}

/** 群聊面板：先删掉旧面板再按当前审核群重建 */
async function rebuildGroupPanel(items: RobotPanelItemDTO[], groups: string[]): Promise<void> {
  const existing = await findPlatformPanel('group');
  if (existing) await deletePlatformPanel(existing.panel_id);
  const panelId = await createRobotPanel({
    scope: 'group',
    targetType: 'specific',
    groupOpenids: groups,
    panel: { items, remark: PANEL_REMARK.group },
  });
  if (groups.length > TARGETS_PER_REQUEST) {
    await updateRobotPanelTargets(panelId, 'add', groups.slice(TARGETS_PER_REQUEST));
  }
}

/** 删除本系统下发的面板（单聊或群聊），返回实际删除数量 */
export async function removeRobotPanels(
  scope: RobotPanelScope,
  actor: AuditActor,
): Promise<{ removed: number }> {
  if (!isRobotConfigured()) {
    throw ApiError.badRequest(BizCode.InvalidInput, '机器人凭据未配置，无法操作指令面板');
  }
  const existing = await findPlatformPanel(scope);
  if (existing) await deletePlatformPanel(existing.panel_id);
  writeAudit({
    operator: actor,
    action: 'robot_panel.delete',
    resource: 'robot_panel',
    targetId: scope,
    before: JSON.stringify({ panel_id: existing?.panel_id ?? '' }),
    detail: `删除 QQ 指令面板（${scope === 'c2c' ? '单聊' : '群聊'}）`,
  });
  return { removed: existing ? 1 : 0 };
}
