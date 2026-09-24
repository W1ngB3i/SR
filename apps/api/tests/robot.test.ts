import { beforeAll, describe, expect, it } from 'vitest';
import { insertContactKey, useTempDataDir } from './helpers.js';

useTempDataDir();

let seed: typeof import('../src/db/seed.js');
let ticket: typeof import('../src/services/ticket.js');
let config: typeof import('../src/services/config.js');
let key: typeof import('../src/services/key.js');
let robot: typeof import('../src/services/robot.js');
let userSvc: typeof import('../src/services/user.js');
let qq: typeof import('../src/services/qq.js');
let dbMod: typeof import('../src/db/index.js');

beforeAll(async () => {
  seed = await import('../src/db/seed.js');
  ticket = await import('../src/services/ticket.js');
  config = await import('../src/services/config.js');
  key = await import('../src/services/key.js');
  robot = await import('../src/services/robot.js');
  userSvc = await import('../src/services/user.js');
  qq = await import('../src/services/qq.js');
  dbMod = await import('../src/db/index.js');
  seed.seedDatabase(true);
});

const wangbei = { id: 'usr-wangbei', name: '望北' };

const groupCtx = (openid: string, content: string, msgId = 'msg-test') => ({
  target: 'group' as const,
  openid,
  guildId: 'guild-1',
  msgId,
  content,
});

/** 取某 openid 名下最新的接洽码 */
function boundCodeOf(openid: string): string {
  const row = dbMod
    .getDb()
    .prepare('SELECT code FROM contact_key WHERE bind_openid = ? ORDER BY created_at DESC LIMIT 1')
    .get(openid) as { code: string } | undefined;
  if (!row) throw new Error(`openid ${openid} 没有绑定接洽码`);
  return row.code;
}

const withPage = (filters: { keyword?: string; role?: string; dept_id?: string } = {}) =>
  robot.listIdentities({ ...filters, page: 1, pageSize: 20 }).items;

describe('QQ 机器人：身份绑定', () => {
  it('审核员发送后台认证 ID 后完成绑定并带出部门', async () => {
    userSvc.updateUser('usr-xingchen', { department_id: 'dept-ec-intl' }, wangbei);
    const reply = await robot.handleInboundMessage(groupCtx('openid-reviewer-1', 'usr-xingchen'));
    expect(reply.content).toContain('已绑定');
    expect(reply.content).toContain('星辰');

    const identity = withPage().find((i) => i.openid === 'openid-reviewer-1');
    expect(identity?.role).toBe('reviewer');
    expect(identity?.dept_id).toBe('dept-ec-intl');
    expect(identity?.dept_name).toBe('EC');
    expect(identity?.user_id).toBe('usr-xingchen');
    expect(identity?.source).toBe('bot');
  });

  it('认证 ID 不存在时不建立绑定', async () => {
    const reply = await robot.handleInboundMessage(groupCtx('openid-stranger-1', 'usr_nobodyhere'));
    expect(reply.content).toContain('不存在');
    expect(withPage().some((i) => i.openid === 'openid-stranger-1')).toBe(false);
  });

  it('系统管理员账号不参与审核，拒绝绑定', async () => {
    const reply = await robot.handleInboundMessage(groupCtx('openid-admin-1', 'usr-admin'));
    expect(reply.content).toContain('不是审核员角色');
    expect(withPage().some((i) => i.openid === 'openid-admin-1')).toBe(false);
  });

  it('重复绑定沿用后台已补录的 QQ 号与部门', async () => {
    robot.updateIdentity('openid-reviewer-1', { qq_number: '123456789' }, wangbei);
    userSvc.updateUser('usr-xingchen', { department_id: null }, wangbei);
    await robot.handleInboundMessage(groupCtx('openid-reviewer-1', 'usr-xingchen', 'msg-rebind'));
    const identity = withPage().find((i) => i.openid === 'openid-reviewer-1');
    expect(identity?.qq_number).toBe('123456789');
    expect(identity?.dept_id).toBe('dept-ec-intl');
  });

  it('未配置凭据时出站消息记为失败并保留错误原因', async () => {
    const reply = await robot.handleInboundMessage(groupCtx('openid-reviewer-2', 'usr-liuyun'));
    expect(reply.direction).toBe('out');
    expect(reply.status).toBe('failed');
    expect(reply.error).toContain('凭据未配置');
  });
});

describe('QQ 机器人：接洽码签发', () => {
  it('玩家 @机器人 拿码后签发并绑定 openid，重复请求复用同一个未使用码', async () => {
    const openid = 'openid-player-1';
    const first = await robot.handleInboundMessage(groupCtx(openid, '拿接洽码', 'msg-a'));
    const code = boundCodeOf(openid);
    expect(first.content).toContain(code);
    expect(key.isContactKeyBound(code)).toBe(true);

    const again = await robot.handleInboundMessage(groupCtx(openid, '再来个接洽码', 'msg-b'));
    expect(again.content).toContain(code);
    const count = (
      dbMod
        .getDb()
        .prepare(`SELECT COUNT(*) AS c FROM contact_key WHERE bind_openid = ?`)
        .get(openid) as { c: number }
    ).c;
    expect(count).toBe(1);
  });

  it('无法识别的消息回复帮助文案', async () => {
    const reply = await robot.handleInboundMessage(groupCtx('openid-player-2', '在吗', 'msg-c'));
    expect(reply.content).toContain('拿接洽码');
  });
});

describe('QQ 机器人：提单强制绑定接洽码', () => {
  it('开关关闭时后台手工接洽码仍可提交', () => {
    expect(config.getConfig('robot_require_bound_key')).toBe(false);
    const code = insertContactKey(dbMod.getDb(), 'RBTAAA');
    const created = ticket.createTicket(
      {
        circle_name: '手工码放行',
        department_id: 'dept-ec-intl',
        mode_id: 'mode-ec-dandao',
        module: 'PE',
        self_proof: false,
        contact: code,
      },
      [],
    );
    expect(created.ticket_id).toBeTruthy();
  });

  it('开关开启后未绑定接洽码被拒绝，机器人签发的接洽码放行', () => {
    config.setConfig('robot_require_bound_key', true, wangbei);
    try {
      const manual = insertContactKey(dbMod.getDb(), 'RBTBBB');
      expect(() =>
        ticket.createTicket(
          {
            circle_name: '手工码拦截',
            department_id: 'dept-ec-intl',
            mode_id: 'mode-ec-dandao',
            module: 'PE',
            self_proof: false,
            contact: manual,
          },
          [],
        ),
      ).toThrowError(/绑定 QQ/);

      const created = ticket.createTicket(
        {
          circle_name: '机器人码放行',
          department_id: 'dept-ec-intl',
          mode_id: 'mode-ec-dandao',
          module: 'PE',
          self_proof: false,
          contact: boundCodeOf('openid-player-1'),
        },
        [],
      );
      expect(created.ticket_id).toBeTruthy();
      // 公示后凭接洽码反查申请人 openid 与所在群，用于结果推送
      const binding = key.findApplicantBinding(created.ticket_id);
      expect(binding?.openid).toBe('openid-player-1');
      expect(binding?.guild_id).toBe('guild-1');
    } finally {
      config.setConfig('robot_require_bound_key', false, wangbei);
    }
  });

  it('未配置凭据时工单通知整体跳过，不产生失败噪音', () => {
    const rows = (
      dbMod
        .getDb()
        .prepare(`SELECT COUNT(*) AS c FROM robot_message WHERE kind = 'ticket_created'`)
        .get() as { c: number }
    ).c;
    expect(rows).toBe(0);
  });
});

describe('QQ 机器人：后台管理', () => {
  it('手工新增 / 更新 / 删除绑定，QQ 号可清空', () => {
    const created = robot.createIdentity(
      { openid: 'openid-manual-1', qq_number: '123456789', role: 'reviewer', dept_id: 'dept-lobby', guild_id: 'guild-2' },
      wangbei,
    );
    expect(created.source).toBe('manual');
    expect(created.dept_name).toBe('联大逐梦起源');

    const updated = robot.updateIdentity('openid-manual-1', { role: 'chief' }, wangbei);
    expect(updated.role).toBe('chief');
    expect(updated.qq_number).toBe('123456789'); // 未传的字段保持原值
    // 显式传空串表示清空（后台把误填的 QQ 号去掉）
    expect(robot.updateIdentity('openid-manual-1', { qq_number: '' }, wangbei).qq_number).toBe('');

    robot.deleteIdentity('openid-manual-1', wangbei);
    expect(withPage({ keyword: 'openid-manual-1' })).toHaveLength(0);
  });

  it('更新不存在的绑定抛出未找到', () => {
    expect(() => robot.updateIdentity('openid-not-exist', { role: 'chief' }, wangbei)).toThrowError(
      /不存在/,
    );
  });

  it('消息日志支持按状态筛选与分页', () => {
    const all = robot.listMessages({ page: 1, pageSize: 20 });
    expect(all.total).toBeGreaterThan(0);
    expect(all.items.length).toBeLessThanOrEqual(20);
    const failed = robot.listMessages({ status: 'failed', page: 1, pageSize: 20 });
    expect(failed.items.every((m) => m.status === 'failed')).toBe(true);
  });

  it('接入状态摘要统计身份、绑定接洽码与失败消息', () => {
    const status = robot.robotSummary(qq.robotPlatformInfo());
    expect(status.configured).toBe(false);
    expect(status.identity_count).toBeGreaterThan(0);
    expect(status.bound_key_count).toBeGreaterThan(0);
    expect(status.failed_message_count).toBeGreaterThan(0);
    expect(status.issuer_name).toBe(key.ROBOT_ISSUER_NAME);
  });
});