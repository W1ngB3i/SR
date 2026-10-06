import {
  DEVICE_NOTES,
  MODULE_LABELS,
  ROBOT_ROLE_LABELS,
  RobotMessageKind,
  RobotRole,
  STATUS_LABELS,
  type DepartmentDTO,
  type DeviceModule,
  type Page,
  type PublicityItemDTO,
  type RobotIdentityDTO,
  type RobotMessageDTO,
  type RobotMessageStatus,
} from '@sr/shared';
import { getDb } from '../db/index.js';
import { newId, nowIso } from '../lib/ids.js';
import { ApiError } from '../lib/errors.js';
import { isRobotConfigured } from '../env.js';
import { writeAudit, type AuditActor } from './audit.js';
import { getConfig } from './config.js';
import { getStaffUserById } from './user.js';
import { listDepartments } from './rule.js';
import { createTicket, listPublished, lookupTicketForOpenid } from './ticket.js';
import {
  ackInteraction,
  applyLink,
  downloadRobotAttachment,
  publishedLink,
  resultLink,
  sendRobotMessage,
  ticketLink,
} from './qq.js';
import {
  clearSession,
  getSession,
  saveSession,
  type ApplyDraft,
  type RobotEvidence,
  type RobotSession,
  type RobotSessionStep,
} from './robotSession.js';
import { persistEvidenceBuffer } from './storage.js';
import { ROBOT_ISSUER_NAME, findApplicantBinding, issueContactKeyForOpenid } from './key.js';

/**
 * QQ 机器人服务：身份绑定、接洽码签发、消息日志与通知投递。
 * 设计原则：机器人只做触发与通知，表单填写与审核操作始终在网站端完成。
 */

// ---------------------------------------------------------------------------
// 身份绑定
// ---------------------------------------------------------------------------

interface IdentityRow {
  openid: string;
  qq_number: string;
  role: RobotRole;
  dept_id: string | null;
  dept_name: string | null;
  user_id: string | null;
  guild_id: string;
  source: 'bot' | 'manual';
  created_at: string;
}

const IDENTITY_SELECT = `SELECT r.*, d.name AS dept_name
  FROM robot_identities r LEFT JOIN department d ON d.id = r.dept_id`;

function toIdentityDTO(row: IdentityRow): RobotIdentityDTO {
  return {
    openid: row.openid,
    qq_number: row.qq_number,
    role: row.role,
    dept_id: row.dept_id,
    dept_name: row.dept_name,
    source: row.source,
    user_id: row.user_id,
    guild_id: row.guild_id,
    created_at: row.created_at,
  };
}

export function listIdentities(filters: {
  keyword?: string;
  role?: string;
  dept_id?: string;
  page: number;
  pageSize: number;
}): Page<RobotIdentityDTO> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.keyword) {
    where.push('(r.qq_number LIKE ? OR r.openid LIKE ?)');
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }
  if (filters.role) {
    where.push('r.role = ?');
    params.push(filters.role);
  }
  if (filters.dept_id) {
    where.push('r.dept_id = ?');
    params.push(filters.dept_id);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM robot_identities r ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;
  const rows = db
    .prepare(
      `${IDENTITY_SELECT} ${whereSql}
       ORDER BY r.created_at DESC, r.openid ASC LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as IdentityRow[];
  return { items: rows.map(toIdentityDTO), page: filters.page, page_size: filters.pageSize, total };
}

function writeIdentity(
  input: {
    openid: string;
    qq_number: string;
    role: RobotRole;
    dept_id: string | null;
    user_id: string | null;
    guild_id: string;
    source: 'bot' | 'manual';
  },
  actor: AuditActor | null,
): RobotIdentityDTO {
  const db = getDb();
  const before = db
    .prepare(`${IDENTITY_SELECT} WHERE r.openid = ?`)
    .get(input.openid) as IdentityRow | undefined;
  if (before) {
    // qq_number 以调用方传入为准（后台可清空）；guild_id 为空时沿用旧值（私聊重绑不丢所在群）
    db.prepare(
      `UPDATE robot_identities SET qq_number = ?, role = ?, dept_id = ?, user_id = ?, guild_id = ?, source = ?
       WHERE openid = ?`,
    ).run(
      input.qq_number,
      input.role,
      input.dept_id,
      input.user_id,
      input.guild_id || before.guild_id,
      input.source,
      input.openid,
    );
  } else {
    db.prepare(
      `INSERT INTO robot_identities (openid, qq_number, role, dept_id, user_id, guild_id, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.openid,
      input.qq_number,
      input.role,
      input.dept_id,
      input.user_id,
      input.guild_id,
      input.source,
      nowIso(),
    );
  }
  writeAudit({
    operator: actor,
    action: before ? 'robot_identity.update' : 'robot_identity.create',
    resource: 'robot_identity',
    targetId: input.openid,
    before: before ? JSON.stringify({ role: before.role, dept_id: before.dept_id }) : '',
    after: JSON.stringify({ role: input.role, dept_id: input.dept_id, qq_number: input.qq_number }),
    detail: before ? '更新机器人身份绑定' : '新增机器人身份绑定',
  });
  const row = db.prepare(`${IDENTITY_SELECT} WHERE r.openid = ?`).get(input.openid) as IdentityRow;
  return toIdentityDTO(row);
}

/** 总管在后台手动录入绑定，不必等审核员在群里 @机器人 */
export function createIdentity(
  input: {
    openid: string;
    qq_number: string;
    role: RobotRole;
    dept_id?: string | null;
    guild_id?: string;
  },
  actor: AuditActor,
): RobotIdentityDTO {
  return writeIdentity(
    {
      openid: input.openid,
      qq_number: input.qq_number,
      role: input.role,
      dept_id: input.dept_id ?? null,
      user_id: null,
      guild_id: input.guild_id ?? '',
      source: 'manual',
    },
    actor,
  );
}

export function updateIdentity(
  openid: string,
  patch: {
    qq_number?: string;
    role?: RobotRole;
    dept_id?: string | null;
    guild_id?: string;
  },
  actor: AuditActor,
): RobotIdentityDTO {
  const row = getDb()
    .prepare('SELECT * FROM robot_identities WHERE openid = ?')
    .get(openid) as IdentityRow | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '绑定记录不存在');
  return writeIdentity(
    {
      openid,
      qq_number: patch.qq_number ?? row.qq_number,
      role: patch.role ?? row.role,
      dept_id: patch.dept_id === undefined ? row.dept_id : patch.dept_id,
      user_id: row.user_id,
      guild_id: patch.guild_id ?? row.guild_id,
      // 人工修正过的记录标记为手工维护，避免后续被自动绑定覆盖语义
      source: 'manual',
    },
    actor,
  );
}

export function deleteIdentity(openid: string, actor: AuditActor): void {
  const db = getDb();
  const before = db
    .prepare('SELECT * FROM robot_identities WHERE openid = ?')
    .get(openid) as IdentityRow | undefined;
  if (!before) throw ApiError.notFound('RESOURCE_NOT_FOUND', '绑定记录不存在');
  db.prepare('DELETE FROM robot_identities WHERE openid = ?').run(openid);
  writeAudit({
    operator: actor,
    action: 'robot_identity.delete',
    resource: 'robot_identity',
    targetId: openid,
    before: JSON.stringify({ role: before.role, qq_number: before.qq_number }),
    detail: '删除机器人身份绑定',
  });
}

// ---------------------------------------------------------------------------
// 消息日志
// ---------------------------------------------------------------------------

function toMessageDTO(row: MessageRow): RobotMessageDTO {
  return { ...row, kind: row.kind as RobotMessageDTO['kind'] };
}

interface MessageRow {
  id: string;
  direction: 'in' | 'out';
  kind: string;
  status: RobotMessageStatus;
  openid: string;
  guild_id: string;
  content: string;
  ticket_id: string | null;
  contact_key_id: string | null;
  error: string;
  created_at: string;
  sent_at: string | null;
}

export function listMessages(filters: {
  status?: string;
  kind?: string;
  page: number;
  pageSize: number;
}): Page<RobotMessageDTO> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.kind) {
    where.push('kind = ?');
    params.push(filters.kind);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM robot_message ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;
  const rows = db
    .prepare(
      `SELECT * FROM robot_message ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as MessageRow[];
  return { items: rows.map(toMessageDTO), page: filters.page, page_size: filters.pageSize, total };
}

function insertMessage(input: {
  direction: 'in' | 'out';
  kind: RobotMessageKind;
  status: RobotMessageStatus;
  openid: string;
  guildId: string;
  content: string;
  ticketId?: string | null;
  contactKeyId?: string | null;
  error?: string;
  sentAt?: string | null;
}): RobotMessageDTO {
  const row: MessageRow = {
    id: newId('rmsg'),
    direction: input.direction,
    kind: input.kind,
    status: input.status,
    openid: input.openid,
    guild_id: input.guildId,
    content: input.content,
    ticket_id: input.ticketId ?? null,
    contact_key_id: input.contactKeyId ?? null,
    error: input.error ?? '',
    created_at: nowIso(),
    sent_at: input.sentAt ?? null,
  };
  getDb()
    .prepare(
      `INSERT INTO robot_message
        (id, direction, kind, status, openid, guild_id, content, ticket_id, contact_key_id, error, created_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.direction,
      row.kind,
      row.status,
      row.openid,
      row.guild_id,
      row.content,
      row.ticket_id,
      row.contact_key_id,
      row.error,
      row.created_at,
      row.sent_at,
    );
  return toMessageDTO(row);
}

/**
 * 被动回复：必须在平台下发 msg_id 的时效内回复，重复回复以 msg_seq 区分。
 * 群聊的 ctx.openid 为「要 @ 的群成员」，ctx.guildId 为群 openid —— 平台发送路径要求群 openid，
 * 成员只能通过 content 里的 @ 标签提及（<@openid> 旧协议已弃用）。
 */
interface ReplyContext {
  target: 'group' | 'c2c';
  openid: string;
  guildId: string;
  msgId: string;
  /** 机器人收到的原始消息，用于回溯谁 @了机器人、发了什么 */
  inboundContent: string;
}

/** 发送一条出站消息并落库；失败不抛出，转为 failed 记录供总管重发 */
async function deliver(
  ctx: { target: 'group' | 'c2c'; openid: string; guildId: string; msgId?: string },
  message: {
    kind: RobotMessageKind;
    content: string;
    button?: { label: string; url: string };
    ticketId?: string | null;
    contactKeyId?: string | null;
  },
): Promise<RobotMessageDTO> {
  const isGroup = ctx.target === 'group';
  const content =
    isGroup && ctx.openid ? `<qqbot-at-user id="${ctx.openid}" /> ${message.content}` : message.content;
  if (!isRobotConfigured()) {
    return insertMessage({
      direction: 'out',
      kind: message.kind,
      status: 'failed',
      openid: ctx.openid,
      guildId: ctx.guildId,
      content,
      ticketId: message.ticketId,
      contactKeyId: message.contactKeyId,
      error: '机器人凭据未配置（QQ_BOT_APPID / QQ_BOT_SECRET）',
    });
  }
  try {
    await sendRobotMessage({
      target: { kind: ctx.target, openid: isGroup ? ctx.guildId : ctx.openid },
      content,
      msgId: ctx.msgId,
      button: message.button,
    });
    return insertMessage({
      direction: 'out',
      kind: message.kind,
      status: 'sent',
      openid: ctx.openid,
      guildId: ctx.guildId,
      content,
      ticketId: message.ticketId,
      contactKeyId: message.contactKeyId,
      sentAt: nowIso(),
    });
  } catch (err) {
    return insertMessage({
      direction: 'out',
      kind: message.kind,
      status: 'failed',
      openid: ctx.openid,
      guildId: ctx.guildId,
      content,
      ticketId: message.ticketId,
      contactKeyId: message.contactKeyId,
      error: err instanceof Error ? err.message : '发送失败',
    });
  }
}

/**
 * 记一条「没发出去」的日志：无接收人时不能走 deliver —— 那会真的去请求平台并留下
 * 一条永远重发不成功的失败记录。此处只留痕，供总管排查为什么没人收到通知。
 */
function logSkipped(input: {
  kind: RobotMessageKind;
  reason: string;
  ticketId?: string | null;
}): RobotMessageDTO {
  return insertMessage({
    direction: 'out',
    kind: input.kind,
    status: 'skipped',
    openid: '',
    guildId: '',
    content: input.reason,
    ticketId: input.ticketId ?? null,
  });
}

/** 手动重发失败的出站消息 */
export async function resendMessage(id: string, actor: AuditActor): Promise<RobotMessageDTO> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM robot_message WHERE id = ?').get(id) as
    | MessageRow
    | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '消息记录不存在');
  if (row.direction !== 'out') {
    throw ApiError.badRequest('INVALID_INPUT', '只有发出的消息可以重发');
  }
  if (row.status !== 'failed') {
    throw ApiError.badRequest('INVALID_INPUT', '只有发送失败的消息可以重发');
  }
  const result = await deliver(
    { target: row.guild_id ? 'group' : 'c2c', openid: row.openid, guildId: row.guild_id },
    {
      kind: row.kind as RobotMessageKind,
      content: row.content,
      ticketId: row.ticket_id,
      contactKeyId: row.contact_key_id,
    },
  );
  writeAudit({
    operator: actor,
    action: 'robot_message.resend',
    resource: 'robot_message',
    targetId: id,
    after: JSON.stringify({ new_id: result.id, status: result.status }),
    detail: `重发机器人消息（${result.status === 'sent' ? '成功' : '仍失败'}）`,
  });
  return result;
}

// ---------------------------------------------------------------------------
// 入站消息处理
// ---------------------------------------------------------------------------

/** 后台个人中心的认证 ID：新建账号为 usr_<随机串>，内置演示账号为 usr-xingchen 形式 */
const AUTH_ID_RE = /usr[-_][A-Za-z0-9_-]{4,}/;
/** 请求接洽码的关键词 */
const CODE_INTENT_RE = /(接洽码|拿码|要码|申请码|来个码)/;
/** 进入聊天式引导申请 */
const APPLY_RE = /^(申请工单|我要申请|申请|\/apply)$/;
/** 作废当前申请草稿 */
const CANCEL_RE = /^(取消|作废|退出|\/cancel)$/i;
/** 请求绑定审核员身份（指令面板「绑定」元素与文字指令共用） */
const BIND_INTENT_RE = /^(绑定|绑定身份|审核员绑定|认证|认证\s*id)$/i;
/** 帮助 / 指令清单 */
const HELP_RE = /^(帮助|菜单|指令|help|\/help|\?|？)$/i;
/** 部门介绍 */
const DEPT_INTRO_RE = /^(部门介绍|sr\s*历史|公会历史|部门历史)$/i;
/** 进度查询：查询 / 进度 + 可选查询码 */
const QUERY_RE = /^(?:查询|进度)\s*([A-Za-z0-9]{4,12})?$/;
/** 结果公示：公示 / 公示 + 可选部门名或 PE/PC */
const PUBLISHED_RE = /^(?:公示|结果公示)\s*(.*)$/;
/** 审核规则：规则 / 规则 + 可选部门名 */
const RULES_RE = /^(?:规则|标准|难度)\s*(.*)$/;

const HELP_TEXT = [
  '可用指令（群聊请先 @我，私聊直接发送）：',
  '· 申请工单 —— 聊天式填单，在 QQ 内完成申请',
  '· 查询 <查询码> —— 查看工单进度与结果',
  '· 公示 [部门] —— 查看最近结果公示（如：公示 联大）',
  '· 规则 [部门] —— 查看部门难度与审核标准（如：规则 EC）',
  '· 部门介绍 —— 五个部门历史与现状',
  '· 拿接洽码 —— 领取一次性接洽码',
  '· 绑定 <后台认证 ID> —— 审核员完成身份绑定',
].join('\n');

/**
 * 指令面板（QQ 开放平台 /v2/panels）里的 command 元素。
 * command 元素被点击后会把 name 填进聊天输入框，等同于用户直接发送该文本，
 * 因此 name 必须能被上面的分发器正则识别（tests/robot.test.ts 有断言守护），
 * desc 只在面板内展示说明，不参与分发。
 */
export const PANEL_COMMANDS: { name: string; desc: string }[] = [
  { name: '申请工单', desc: '聊天式填单，QQ 内完成申请' },
  { name: '查询', desc: '查看工单进度与结果' },
  { name: '公示', desc: '查看最近结果公示' },
  { name: '规则', desc: '查看部门难度与审核标准' },
  { name: '拿接洽码', desc: '领取一次性接洽码' },
  { name: '绑定', desc: '审核员绑定后台认证 ID' },
  { name: '部门介绍', desc: '五大部门历史与现状' },
  { name: '帮助', desc: '查看全部指令与用法' },
];

/** 指令面板的 link 元素：去网站申请页（HashRouter 必须带 /#/，否则内嵌浏览器掉回首页） */
export const PANEL_LINK_ITEM = { name: '去网站申请', desc: '在网页端填写并上传证据' };

/** 五个部门历史与现状：口径摘自落地页设计文案 */
const DEPARTMENT_INTRO_TEXT = [
  'SR 公会五大部门：',
  '01 SR_Party（起点 · Misaki）—— 公会最早的班底，2021 年 Misaki 国际服一战由它主导。',
  '02 SR_Team（布吉岛 · Java）—— 前身是花雨庭部门，椿枕、逗号、神迹、PWG、立法人（TDA）都在这里待过。',
  '03 SR_Group（联机大厅）—— 岚天殿在此铸下名号，川狱、焚天殿、MERC、白川、PAS、YFS、Lgs、茗门相继加入。',
  '04 SR_Arrow（租赁服）—— 在红铁、Ltier 圈子里有一席之地，大规模公会战随时能拉人打。',
  '05 SR_Explore（开拓）—— 开拓部门，政审模式，联系 323992228。',
].join('\n');

/** 平台 content_type → 文件后缀，用于 QQ 附件落盘命名 */
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

/** 入站消息携带的图片/视频附件（平台 attachments[]） */
export interface InboundAttachment {
  url: string;
  content_type: string;
  filename?: string;
}

export interface InboundContext {
  target: 'group' | 'c2c';
  /** 群聊为群成员 openid，私聊为用户 openid */
  openid: string;
  /** 群 openid；私聊为空 */
  guildId: string;
  /** 平台下发的消息 ID，用于被动回复 */
  msgId: string;
  content: string;
  /** 图片/视频附件，用于证据接收 */
  attachments?: InboundAttachment[];
  /** 交互事件 id：按钮 / 快捷菜单回调需在 3 秒内 PUT 应答 */
  interactionId?: string;
}

/**
 * 入站消息统一入口：菜单回调、群内 @、私聊三种来源共用同一套分发逻辑。
 * 顺序：交互应答 → 打断型指令（绑定/拿码）→ 显式申请 → 申请会话 → 只读指令 → 兜底。
 */
export async function handleInboundMessage(ctx: InboundContext): Promise<RobotMessageDTO> {
  // 按钮 / 快捷菜单回调需在 3 秒内应答，失败只记日志、不阻断后续回复
  if (ctx.interactionId) {
    try {
      await ackInteraction(ctx.interactionId);
    } catch (err) {
      console.error('[robot] 交互应答失败:', err);
    }
  }

  const content = ctx.content.trim();
  const hasAttachments = (ctx.attachments?.length ?? 0) > 0;

  // 1. 打断型指令：审核员绑定 / 拿接洽码 —— 优先于申请流程，并作废当前草稿
  if (AUTH_ID_RE.test(content)) {
    clearSession(ctx.openid, ctx.target);
    return handleReviewerBind(ctx, content);
  }
  if (CODE_INTENT_RE.test(content)) {
    clearSession(ctx.openid, ctx.target);
    return handleIssueCode(ctx, content);
  }
  if (BIND_INTENT_RE.test(content)) {
    clearSession(ctx.openid, ctx.target);
    return handleBindPrompt(ctx, content);
  }

  // 2. 显式申请入口：重置并从头开始
  if (APPLY_RE.test(content)) return startApply(ctx, content);

  // 3. 显式取消：仅在存在草稿时响应，否则按普通未知消息兜底
  if (CANCEL_RE.test(content)) {
    const active = getSession(ctx.openid, ctx.target);
    if (active) {
      clearSession(ctx.openid, ctx.target);
      logInbound(ctx, RobotMessageKind.ApplyTicket, content);
      return deliver(ctx, {
        kind: RobotMessageKind.ApplyTicket,
        content: '已取消本次申请，草稿已作废。发送「申请工单」可重新开始。',
      });
    }
  }

  // 4. 申请会话进行中：只读指令可穿插查看，其余输入一律交给当前步骤处理（含纯附件消息）
  const session = getSession(ctx.openid, ctx.target);
  if (session && !isReadOnlyCommand(content)) {
    return handleApplyStep(ctx, session, content);
  }

  // 5. 只读指令
  if (HELP_RE.test(content)) return handleHelp(ctx, content);
  if (DEPT_INTRO_RE.test(content)) return handleDepartmentIntro(ctx, content);
  const queryMatch = content.match(QUERY_RE);
  if (queryMatch) return handleQuery(ctx, content, (queryMatch[1] ?? '').toUpperCase());
  const publishedMatch = content.match(PUBLISHED_RE);
  if (publishedMatch) return handlePublished(ctx, content, (publishedMatch[1] ?? '').trim());
  const rulesMatch = content.match(RULES_RE);
  if (rulesMatch) return handleRules(ctx, content, (rulesMatch[1] ?? '').trim());

  // 6. 未进入申请流程却发来图片/视频：明确引导，避免证据丢失
  if (hasAttachments) {
    logInbound(ctx, RobotMessageKind.Evidence, content || '[图片/视频]');
    return deliver(ctx, {
      kind: RobotMessageKind.Evidence,
      content:
        '收到你的图片/视频了。请先发送「申请工单」进入申请流程，再在证据步骤发送，我才会把它作为工单证据入库。',
    });
  }

  // 7. 兜底
  logInbound(ctx, RobotMessageKind.Unhandled, content);
  return deliver(ctx, { kind: RobotMessageKind.Unhandled, content: HELP_TEXT });
}

/** 只读指令：不打断正在进行的申请会话，可随时穿插查看 */
function isReadOnlyCommand(content: string): boolean {
  return (
    HELP_RE.test(content) ||
    DEPT_INTRO_RE.test(content) ||
    QUERY_RE.test(content) ||
    PUBLISHED_RE.test(content) ||
    RULES_RE.test(content)
  );
}

/** 记一条入站消息（各指令按语义归入对应 kind，便于后台排查） */
function logInbound(ctx: InboundContext, kind: RobotMessageKind, content: string): void {
  insertMessage({
    direction: 'in',
    kind,
    status: 'received',
    openid: ctx.openid,
    guildId: ctx.guildId,
    content,
  });
}

// ---------------------------------------------------------------------------
// 只读指令：帮助 / 部门介绍 / 进度查询 / 结果公示 / 审核规则
// ---------------------------------------------------------------------------

async function handleHelp(ctx: InboundContext, content: string): Promise<RobotMessageDTO> {
  logInbound(ctx, RobotMessageKind.Help, content);
  return deliver(ctx, { kind: RobotMessageKind.Help, content: HELP_TEXT });
}

async function handleDepartmentIntro(ctx: InboundContext, content: string): Promise<RobotMessageDTO> {
  logInbound(ctx, RobotMessageKind.DepartmentIntro, content);
  return deliver(ctx, { kind: RobotMessageKind.DepartmentIntro, content: DEPARTMENT_INTRO_TEXT });
}

async function handleQuery(
  ctx: InboundContext,
  content: string,
  code: string,
): Promise<RobotMessageDTO> {
  logInbound(ctx, RobotMessageKind.QueryStatus, content);
  if (!code) {
    return deliver(ctx, {
      kind: RobotMessageKind.QueryStatus,
      content: '请回复「查询 + 查询码」，例如：查询 AB2CDE。',
    });
  }
  if (!/^[A-Z2-9]{8}$/.test(code)) {
    return deliver(ctx, {
      kind: RobotMessageKind.QueryStatus,
      content: '查询码为 8 位大写字母或数字，请核对后重新发送。',
    });
  }
  try {
    const { ticket, receipt } = lookupTicketForOpenid(code, ctx.openid);
    const lines = [
      `工单 ${ticket.id}`,
      `状态：${STATUS_LABELS[ticket.status]}`,
      `部门：${ticket.department_name}｜模式：${ticket.mode_group ? `${ticket.mode_group} ` : ''}${ticket.mode_name}`,
      `模块：${MODULE_LABELS[ticket.module]}｜自证：${ticket.self_proof ? '有' : '无'}`,
    ];
    if (ticket.assignee_name) lines.push(`审核员：${ticket.assignee_name}`);
    if (ticket.status === 'supplementing' && ticket.supplement_reason) {
      lines.push(`需补充：${ticket.supplement_reason}`);
    }
    if (receipt && !receipt.is_draft) {
      const grades = [
        receipt.pe_grade ? `PE ${receipt.pe_grade}` : '',
        receipt.pc_grade ? `PC ${receipt.pc_grade}` : '',
      ]
        .filter(Boolean)
        .join('／');
      lines.push(
        `结果：${receipt.pass ? '通过' : '不通过'}${receipt.target_department ? `，可进入 ${receipt.target_department}` : ''}`,
      );
      if (grades) lines.push(`成绩：${grades}`);
      if (receipt.comment) lines.push(`评语：${receipt.comment}`);
    }
    return deliver(ctx, {
      kind: RobotMessageKind.QueryStatus,
      content: lines.join('\n'),
      button: { label: '去网站查看', url: resultLink(code) },
      ticketId: ticket.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败，请稍后重试。';
    return deliver(ctx, {
      kind: RobotMessageKind.QueryStatus,
      content: message,
      button: { label: '去网站查询', url: resultLink(code) },
    });
  }
}

async function handlePublished(
  ctx: InboundContext,
  content: string,
  arg: string,
): Promise<RobotMessageDTO> {
  logInbound(ctx, RobotMessageKind.PublishedList, content);
  const departments = listDepartments(false);
  const filters: { department_id?: string; module?: string } = {};
  let label = '全部部门';
  if (arg) {
    const upper = arg.toUpperCase();
    if (upper === 'PE' || upper === 'PC' || upper === 'BOTH') {
      filters.module = upper;
      label = MODULE_LABELS[upper as DeviceModule];
    } else {
      const department = findDepartment(arg, departments);
      if (!department) {
        return deliver(ctx, {
          kind: RobotMessageKind.PublishedList,
          content: `未找到部门「${arg}」。\n${formatDepartmentList(departments)}`,
        });
      }
      filters.department_id = department.id;
      label = department.name;
    }
  }
  const page = listPublished({ ...filters, page: 1, pageSize: 10 });
  return deliver(ctx, {
    kind: RobotMessageKind.PublishedList,
    content: formatPublished(page.items, label, page.total),
    button: { label: '去网站看公示', url: publishedLink() },
  });
}

async function handleRules(
  ctx: InboundContext,
  content: string,
  arg: string,
): Promise<RobotMessageDTO> {
  logInbound(ctx, RobotMessageKind.Rules, content);
  const departments = listDepartments(false);
  if (!arg) {
    return deliver(ctx, { kind: RobotMessageKind.Rules, content: formatRulesOverview(departments) });
  }
  const department = findDepartment(arg, departments);
  if (!department) {
    return deliver(ctx, {
      kind: RobotMessageKind.Rules,
      content: `未找到部门「${arg}」。\n${formatDepartmentList(departments)}`,
    });
  }
  return deliver(ctx, { kind: RobotMessageKind.Rules, content: formatRulesForDepartment(department) });
}

// ---------------------------------------------------------------------------
// 聊天式引导申请：一问一答状态机
// ---------------------------------------------------------------------------

async function startApply(ctx: InboundContext, content: string): Promise<RobotMessageDTO> {
  logInbound(ctx, RobotMessageKind.ApplyTicket, content);
  saveSession(ctx.openid, ctx.target, 'circle_name', {});
  return deliver(ctx, {
    kind: RobotMessageKind.ApplyTicket,
    content: '开始申请工单（全程可回复「取消」作废）。\n第 1 步：请发送你在游戏内使用的圈名（不超过 24 个字）。',
  });
}

async function handleApplyStep(
  ctx: InboundContext,
  session: RobotSession,
  content: string,
): Promise<RobotMessageDTO> {
  const draft: ApplyDraft = { ...session.draft };
  const reply = (text: string) =>
    deliver(ctx, { kind: RobotMessageKind.ApplyTicket, content: text });
  const advance = (step: RobotSessionStep) => saveSession(ctx.openid, ctx.target, step, draft);

  switch (session.step) {
    case 'circle_name': {
      const circleName = content.trim();
      if (!circleName || circleName.length > 24) {
        return reply('圈名不能为空且不超过 24 个字，请重新发送。');
      }
      draft.circle_name = circleName;
      advance('contact');
      return reply('第 2 步：请发送接洽码（还没有的话，先发送「拿接洽码」领取）。');
    }
    case 'contact': {
      const code = content.trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(code)) {
        return reply('接洽码为 6 位大写字母或数字，请核对后重新发送。');
      }
      const row = getDb()
        .prepare('SELECT status, bind_openid FROM contact_key WHERE code = ?')
        .get(code) as { status: string; bind_openid: string | null } | undefined;
      if (!row) return reply('接洽码不存在，请核对后重新发送，或发送「拿接洽码」领取新码。');
      if (row.status !== 'unused') return reply('该接洽码已被使用，请发送「拿接洽码」领取新码。');
      if (!row.bind_openid || row.bind_openid !== ctx.openid) {
        return reply(
          '该接洽码不是你在机器人处领取的，无法用于 QQ 申请。请发送「拿接洽码」领取属于你的码，或改用网站申请。',
        );
      }
      draft.contact = code;
      const departments = listDepartments(false);
      if (departments.length === 0) return reply('当前没有可申请的部门，请稍后再试。');
      advance('department');
      return reply(`第 3 步：请选择审核部门（回复编号或名称）：\n${formatDepartmentList(departments)}`);
    }
    case 'department': {
      const departments = listDepartments(false);
      const index = pickIndex(content, departments.length);
      const department = index !== null ? departments[index] : findDepartment(content, departments);
      if (!department) {
        return reply(`没有找到该部门，请回复编号或部门名称：\n${formatDepartmentList(departments)}`);
      }
      if (department.modes.length === 0) {
        return reply(`「${department.name}」暂未配置审核模式，请回复「取消」后换个部门，或联系审核总管。`);
      }
      draft.department_id = department.id;
      draft.department_name = department.name;
      advance('mode');
      return reply(`第 4 步：请选择审核模式（回复编号或名称）：\n${formatModeList(department)}`);
    }
    case 'mode': {
      const department = listDepartments(false).find((d) => d.id === draft.department_id);
      if (!department) {
        clearSession(ctx.openid, ctx.target);
        return reply('申请会话已失效，请重新发送「申请工单」开始。');
      }
      const index = pickIndex(content, department.modes.length);
      const keyword = content.trim().toLowerCase();
      const mode =
        index !== null
          ? department.modes[index]
          : department.modes.find((m) => keyword.length > 0 && m.name.toLowerCase().includes(keyword));
      if (!mode) return reply(`没有找到该模式，请回复编号或名称：\n${formatModeList(department)}`);
      draft.mode_id = mode.id;
      draft.mode_name = mode.name;
      advance('module');
      return reply('第 5 步：请选择审核模块（回复编号或名称）：\n1. PE（触屏）\n2. PC（键鼠）\n3. 两者（双端）');
    }
    case 'module': {
      const module = parseModule(content);
      if (!module) return reply('请回复 1/PE（触屏）、2/PC（键鼠）或 3/两者（双端）。');
      draft.module = module;
      advance('self_proof');
      return reply('第 6 步：是否有自证（本人操作视频，画面含手部或设备）？回复「有」或「无」。');
    }
    case 'self_proof': {
      const selfProof = parseYesNo(content);
      if (selfProof === null) return reply('请回复「有」或「无」。');
      draft.self_proof = selfProof;
      draft.evidence = draft.evidence ?? [];
      advance('evidence');
      const hint =
        ctx.target === 'group'
          ? '（群聊收图需群主开启「获取群内全部消息」；收不到时可回复「跳过」，提交后到网站补充）'
          : '';
      return reply(
        `第 7 步：请直接发送图片/视频作为证据（最多 ${maxEvidence()} 个）${hint}，或回复「跳过」。`,
      );
    }
    case 'evidence': {
      if (/^(跳过|skip|没有|无|none)$/i.test(content.trim())) {
        return showConfirm(ctx, draft);
      }
      const attachments = ctx.attachments ?? [];
      if (attachments.length === 0) return reply('请发送图片/视频作为证据，或回复「跳过」。');
      const limit = maxEvidence();
      const evidence = draft.evidence ?? [];
      const failures: string[] = [];
      for (const attachment of attachments) {
        if (evidence.length >= limit) break;
        try {
          evidence.push(await storeInboundAttachment(attachment));
        } catch (err) {
          failures.push(err instanceof Error ? err.message : '下载失败');
        }
      }
      draft.evidence = evidence;
      if (evidence.length >= limit) return showConfirm(ctx, draft);
      advance('evidence');
      const suffix = failures.length > 0 ? `\n（${failures.length} 个附件未能保存：${failures[0]}）` : '';
      return reply(`已收到 ${evidence.length}/${limit} 份证据，可继续发送，或回复「跳过」进入确认。${suffix}`);
    }
    case 'confirm': {
      if (/^(确认|提交|确定|yes|ok|\/confirm)$/i.test(content.trim())) {
        return submitApply(ctx, draft);
      }
      if (CANCEL_RE.test(content.trim())) {
        clearSession(ctx.openid, ctx.target);
        return reply('已取消本次申请，草稿已作废。');
      }
      return reply('请回复「确认」提交，或回复「取消」作废。');
    }
    default: {
      clearSession(ctx.openid, ctx.target);
      return reply('申请会话异常，请重新发送「申请工单」开始。');
    }
  }
}

/** 证据步骤收尾（跳过或已达上限）：保存草稿并展示确认摘要 */
async function showConfirm(ctx: InboundContext, draft: ApplyDraft): Promise<RobotMessageDTO> {
  saveSession(ctx.openid, ctx.target, 'confirm', draft);
  return deliver(ctx, { kind: RobotMessageKind.ApplyTicket, content: applySummary(draft) });
}

/** 确认提交：调用与网站一致的 createTicket，复用冷却期/校验/审核员通知 */
async function submitApply(ctx: InboundContext, draft: ApplyDraft): Promise<RobotMessageDTO> {
  const { circle_name, contact, department_id, mode_id, module } = draft;
  const missing: string[] = [];
  if (!circle_name) missing.push('圈名');
  if (!contact) missing.push('接洽码');
  if (!department_id) missing.push('部门');
  if (!mode_id) missing.push('模式');
  if (!module) missing.push('模块');
  if (!circle_name || !contact || !department_id || !mode_id || !module) {
    saveSession(ctx.openid, ctx.target, 'circle_name', {});
    return deliver(ctx, {
      kind: RobotMessageKind.ApplyTicket,
      content: `申请信息不完整（缺少：${missing.join('、')}），请重新发送「申请工单」开始。`,
    });
  }
  try {
    const result = createTicket(
      {
        circle_name,
        department_id,
        mode_id,
        module,
        self_proof: draft.self_proof ?? false,
        contact,
      },
      [],
      (draft.evidence ?? []).map((item) => ({
        filename: item.filename,
        kind: item.kind,
        storageKey: item.storage_key,
        size: item.size,
      })),
    );
    clearSession(ctx.openid, ctx.target);
    return deliver(ctx, {
      kind: RobotMessageKind.ApplyTicket,
      content: `提交成功！你的查询码是 ${result.query_code}，发送「查询 ${result.query_code}」可随时查看进度。`,
      button: { label: '去网站查看', url: resultLink(result.query_code) },
      ticketId: result.ticket_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '提交失败，请稍后重试。';
    return deliver(ctx, { kind: RobotMessageKind.ApplyTicket, content: `提交未成功：${message}` });
  }
}

/** 「绑定」只作提示：真正的绑定动作在收到后台认证 ID（usr-xxxx）时执行 */
async function handleBindPrompt(ctx: InboundContext, content: string): Promise<RobotMessageDTO> {
  logInbound(ctx, RobotMessageKind.ReviewerBind, content);
  return deliver(ctx, {
    kind: RobotMessageKind.ReviewerBind,
    content:
      '请发送你的后台认证 ID（形如 usr_xxxxxxxx，可在管理后台右上角点击自己的名字复制），我来完成审核员绑定。',
  });
}

async function handleReviewerBind(ctx: InboundContext, content: string): Promise<RobotMessageDTO> {
  const userId = content.match(AUTH_ID_RE)![0];
  logInbound(ctx, RobotMessageKind.ReviewerBind, content);
  const user = getStaffUserById(userId);
  if (!user) {
    return deliver(ctx, {
      kind: RobotMessageKind.ReviewerBind,
      content: `认证 ID「${userId}」不存在，请到网站后台个人中心核对后重发。`,
    });
  }
  if (user.status !== 'active') {
    return deliver(ctx, {
      kind: RobotMessageKind.ReviewerBind,
      content: `账号「${user.name}」已停用，无法绑定，请联系审核总管。`,
    });
  }
  const robotRole = toRobotRole(user.role);
  if (!robotRole) {
    return deliver(ctx, {
      kind: RobotMessageKind.ReviewerBind,
      content: `认证 ID「${userId}」对应的账号不是审核员角色，无法绑定。`,
    });
  }
  // 重绑时保留后台已补录的信息：机器人侧拿不到 QQ 号，系统侧账号也可能还没配部门
  const previous = getDb()
    .prepare('SELECT qq_number, dept_id FROM robot_identities WHERE openid = ?')
    .get(ctx.openid) as { qq_number: string; dept_id: string | null } | undefined;
  writeIdentity(
    {
      openid: ctx.openid,
      qq_number: previous?.qq_number ?? '',
      role: robotRole,
      dept_id: user.department_id ?? previous?.dept_id ?? null,
      user_id: user.id,
      guild_id: ctx.guildId,
      source: 'bot',
    },
    null,
  );
  const deptText = user.department_name ? `${user.department_name} ` : '';
  return deliver(ctx, {
    kind: RobotMessageKind.ReviewerBind,
    content: `已绑定为${deptText}${ROBOT_ROLE_LABELS[robotRole]} ${user.name}，新工单将自动 @你。`,
  });
}

async function handleIssueCode(ctx: InboundContext, content: string): Promise<RobotMessageDTO> {
  logInbound(ctx, RobotMessageKind.IssueCode, content);
  const key = issueContactKeyForOpenid(ctx.openid, ctx.guildId);
  return deliver(ctx, {
    kind: RobotMessageKind.IssueCode,
    content: `这是你的接洽码 ${key.code}，点这里去申请。`,
    button: { label: '去申请', url: applyLink(key.code) },
    contactKeyId: key.id,
  });
}

/** 下载 QQ 附件并落盘，返回随草稿暂存的证据描述 */
async function storeInboundAttachment(attachment: InboundAttachment): Promise<RobotEvidence> {
  const { buffer, contentType } = await downloadRobotAttachment(attachment.url);
  const extension = EXT_BY_CONTENT_TYPE[contentType] ?? '.bin';
  const filename = attachment.filename || `qq-evidence-${newId('ev')}${extension}`;
  const kindHint = contentType.startsWith('image/')
    ? 'image'
    : contentType.startsWith('video/')
      ? 'video'
      : undefined;
  const stored = persistEvidenceBuffer(buffer, filename, kindHint);
  return {
    filename: stored.filename,
    kind: stored.kind,
    storage_key: stored.storageKey,
    size: stored.size,
  };
}

function maxEvidence(): number {
  return Math.max(1, getConfig('upload_limits').max_files);
}

/** 按编号或名称模糊匹配部门（如「联大」→「联大逐梦起源」） */
function findDepartment(query: string, departments: DepartmentDTO[]): DepartmentDTO | null {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return null;
  const exact = departments.find((department) => department.name.toLowerCase() === keyword);
  if (exact) return exact;
  return (
    departments.find((department) => department.name.toLowerCase().includes(keyword)) ??
    departments.find((department) => keyword.includes(department.name.toLowerCase())) ??
    null
  );
}

/** 输入为 1..count 的序号则返回其下标，否则返回 null */
function pickIndex(content: string, count: number): number | null {
  const value = Number(content.trim());
  return Number.isInteger(value) && value >= 1 && value <= count ? value - 1 : null;
}

function parseModule(content: string): DeviceModule | null {
  const value = content.trim().toLowerCase();
  if (['1', 'pe', '触屏', '手机', 'ipad'].includes(value)) return 'PE';
  if (['2', 'pc', '键鼠', '电脑'].includes(value)) return 'PC';
  if (['3', 'both', '两者', '双端', '都'].includes(value)) return 'BOTH';
  return null;
}

function parseYesNo(content: string): boolean | null {
  const value = content.trim().toLowerCase();
  if (['有', '是', '1', 'yes', 'y', 'true'].includes(value)) return true;
  if (['无', '否', '没有', '0', 'no', 'n', 'false'].includes(value)) return false;
  return null;
}

function formatDepartmentList(departments: DepartmentDTO[]): string {
  return departments
    .map((department, index) => `${index + 1}. ${department.name}${department.tier ? `（${department.tier}）` : ''}`)
    .join('\n');
}

function formatModeList(department: DepartmentDTO): string {
  return department.modes
    .map(
      (mode, index) =>
        `${index + 1}. ${mode.group_name ? `${mode.group_name} ` : ''}${mode.name}${mode.min_requirement ? `（${mode.min_requirement}）` : ''}`,
    )
    .join('\n');
}

function formatPublished(items: PublicityItemDTO[], label: string, total: number): string {
  if (items.length === 0) return `${label}暂无公示结果。`;
  const lines = [`${label}最近公示（共 ${total} 条，展示 ${items.length} 条）：`];
  for (const item of items) {
    const grades = [
      item.pe_grade ? `PE ${item.pe_grade}` : '',
      item.pc_grade ? `PC ${item.pc_grade}` : '',
    ]
      .filter(Boolean)
      .join('／');
    lines.push(
      `· ${item.circle_name_masked}｜${item.department_name}${item.mode_name}｜${item.pass ? '通过' : '不通过'}${grades ? `｜${grades}` : ''}`,
    );
  }
  return lines.join('\n');
}

function formatRulesOverview(departments: DepartmentDTO[]): string {
  const lines = [
    '审核规则总览：',
    '设备界定：',
    ...DEVICE_NOTES.map((note) => `  - ${note}`),
    '难度档位：B+ Tier / B- Tier / C+ Tier / 政审',
    '部门与模式（回复「规则 + 部门名」看详情）：',
  ];
  for (const department of departments) {
    const modes = department.modes.map((mode) => mode.name).join(' / ') || '待补充';
    lines.push(`  · ${department.name}${department.tier ? `（${department.tier}）` : ''}：${modes}`);
  }
  return lines.join('\n');
}

function formatRulesForDepartment(department: DepartmentDTO): string {
  const lines = [`${department.name}${department.tier ? `（${department.tier}）` : ''}`];
  if (department.description) lines.push(department.description);
  if (department.contact) lines.push(`联系方式：${department.contact}`);
  lines.push('审核模式：');
  if (department.modes.length === 0) lines.push('  · 暂未配置');
  for (const mode of department.modes) {
    lines.push(
      `  · ${mode.group_name ? `${mode.group_name} ` : ''}${mode.name}${mode.min_requirement ? `（${mode.min_requirement}）` : ''}`,
    );
  }
  lines.push('设备界定：');
  for (const note of DEVICE_NOTES) lines.push(`  - ${note}`);
  return lines.join('\n');
}

function applySummary(draft: ApplyDraft): string {
  return [
    '请确认工单信息：',
    `圈名：${draft.circle_name ?? '-'}`,
    `接洽码：${draft.contact ?? '-'}`,
    `部门：${draft.department_name ?? '-'}`,
    `模式：${draft.mode_name ?? '-'}`,
    `模块：${draft.module ? MODULE_LABELS[draft.module] : '-'}`,
    `自证：${draft.self_proof ? '有' : '无'}`,
    `证据：${draft.evidence?.length ?? 0} 份`,
    '回复「确认」提交，或回复「取消」作废。',
  ].join('\n');
}

/** 系统角色 → 机器人角色；系统管理员不参与审核，不绑定 */
function toRobotRole(role: string): RobotRole | null {
  if (role === 'reviewer') return RobotRole.Reviewer;
  if (role === 'deputy') return RobotRole.Deputy;
  if (role === 'chief') return RobotRole.Chief;
  return null;
}

// ---------------------------------------------------------------------------
// 工单通知（工单创建 → @审核员；工单公示 → @申请人）
// ---------------------------------------------------------------------------

interface TicketNoticeRow {
  id: string;
  circle_name: string;
  department_id: string;
  department_name: string;
  mode_name: string;
  mode_group: string;
}

function loadTicketNotice(ticketId: string): TicketNoticeRow | null {
  const row = getDb()
    .prepare(
      `SELECT t.id, t.circle_name, t.department_id, d.name AS department_name,
              m.name AS mode_name, m.group_name AS mode_group
       FROM ticket t
       JOIN department d ON d.id = t.department_id
       JOIN mode m ON m.id = t.mode_id
       WHERE t.id = ?`,
    )
    .get(ticketId) as TicketNoticeRow | undefined;
  return row ?? null;
}

/**
 * 工单创建后 @该部门审核员。
 * 未配置机器人凭据时整体跳过，避免本地环境产生大量无效失败记录。
 */
export async function notifyReviewersForTicket(ticketId: string): Promise<void> {
  if (!isRobotConfigured()) return;
  const ticket = loadTicketNotice(ticketId);
  if (!ticket) return;
  const reviewers = getDb()
    .prepare(
      `SELECT openid, guild_id FROM robot_identities
       WHERE dept_id = ? AND role IN ('reviewer','deputy','chief') AND guild_id <> ''
       ORDER BY created_at ASC`,
    )
    .all(ticket.department_id) as { openid: string; guild_id: string }[];

  const modeText = ticket.mode_group ? `${ticket.mode_group} ${ticket.mode_name}` : ticket.mode_name;
  const content = `新工单 ${ticket.id}，圈名 ${ticket.circle_name}，部门 ${ticket.department_name}，模式 ${modeText}，点这里接单。`;
  const button = { label: '去接单', url: ticketLink(ticket.id) };

  if (reviewers.length === 0) {
    logSkipped({
      kind: RobotMessageKind.TicketCreated,
      reason: `工单 ${ticket.id}（${ticket.department_name}）没有已绑定该部门的审核员，未 @任何人；可在「身份绑定」补录。`,
      ticketId: ticket.id,
    });
    return;
  }
  for (const reviewer of reviewers) {
    await deliver(
      { target: 'group', openid: reviewer.openid, guildId: reviewer.guild_id },
      { kind: RobotMessageKind.TicketCreated, content, button, ticketId: ticket.id },
    );
  }
}

/** 工单公示后 @申请人推送结果（openid 取自接洽码绑定） */
export async function notifyApplicantForTicket(ticketId: string): Promise<void> {
  if (!isRobotConfigured()) return;
  const binding = findApplicantBinding(ticketId);
  const ticket = loadTicketNotice(ticketId);
  if (!ticket) return;
  if (!binding) {
    logSkipped({
      kind: RobotMessageKind.TicketResult,
      reason: `工单 ${ticket.id} 已公示，但该工单的接洽码未绑定 QQ，无法 @申请人推送结果。`,
      ticketId: ticket.id,
    });
    return;
  }
  const receipt = getDb()
    .prepare('SELECT pass FROM receipt WHERE ticket_id = ?')
    .get(ticketId) as { pass: number | null } | undefined;
  const verdict = receipt?.pass === 1 ? '通过' : '不通过';
  // 签发接洽码时记下的群优先；历史数据没有群标识时回退查身份绑定，再不行走私聊
  const groupId =
    binding.guild_id ||
    (
      getDb()
        .prepare('SELECT guild_id FROM robot_identities WHERE openid = ?')
        .get(binding.openid) as { guild_id: string } | undefined
    )?.guild_id ||
    '';
  await deliver(
    { target: groupId ? 'group' : 'c2c', openid: binding.openid, guildId: groupId },
    {
      kind: RobotMessageKind.TicketResult,
      content: `工单 ${ticket.id} 审核结果：${verdict}。圈名 ${ticket.circle_name}，部门 ${ticket.department_name}。`,
      button: { label: '查看结果', url: resultLink(binding.code) },
      ticketId: ticket.id,
    },
  );
}

/** 管理后台展示的机器人接入状态 */
export function robotSummary(platform: { configured: boolean; sandbox: boolean; appid: string }): {
  configured: boolean;
  sandbox: boolean;
  appid: string;
  identity_count: number;
  bound_key_count: number;
  failed_message_count: number;
  issuer_name: string;
} {
  const db = getDb();
  const count = (sql: string): number => (db.prepare(sql).get() as { c: number }).c;
  return {
    ...platform,
    identity_count: count('SELECT COUNT(*) AS c FROM robot_identities'),
    bound_key_count: count('SELECT COUNT(*) AS c FROM contact_key WHERE bind_openid IS NOT NULL'),
    failed_message_count: count(`SELECT COUNT(*) AS c FROM robot_message WHERE status = 'failed'`),
    issuer_name: ROBOT_ISSUER_NAME,
  };
}