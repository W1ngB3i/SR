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

describe('QQ 机器人：只读指令', () => {
  it('帮助菜单列出全部指令', async () => {
    const reply = await robot.handleInboundMessage(groupCtx('openid-help-1', '帮助'));
    expect(reply.kind).toBe('help');
    expect(reply.content).toContain('申请工单');
    expect(reply.content).toContain('查询');
    expect(reply.content).toContain('公示');
    expect(reply.content).toContain('规则');
  });

  it('部门介绍返回五大部门', async () => {
    const reply = await robot.handleInboundMessage(groupCtx('openid-dept-1', '部门介绍'));
    expect(reply.kind).toBe('department_intro');
    expect(reply.content).toContain('SR_Party');
    expect(reply.content).toContain('SR_Explore');
  });

  it('规则总览包含设备界定与部门清单', async () => {
    const reply = await robot.handleInboundMessage(groupCtx('openid-rules-1', '规则'));
    expect(reply.kind).toBe('rules');
    expect(reply.content).toContain('设备界定');
    expect(reply.content).toContain('EC');
  });

  it('未配置凭据时结果公示也照常返回内容', async () => {
    const reply = await robot.handleInboundMessage(groupCtx('openid-pub-1', '公示'));
    expect(reply.kind).toBe('published_list');
    expect(reply.content).toContain('公示');
  });
});

describe('QQ 机器人：聊天式申请', () => {
  it('一问一答完成申请、生成工单并可凭查询码查看进度', async () => {
    const openid = 'openid-apply-1';
    await robot.handleInboundMessage(groupCtx(openid, '拿接洽码', 'a0'));
    const code = boundCodeOf(openid);

    expect((await robot.handleInboundMessage(groupCtx(openid, '申请工单', 'a1'))).content).toContain('圈名');
    expect((await robot.handleInboundMessage(groupCtx(openid, '机器人测试圈', 'a2'))).content).toContain('接洽码');
    expect((await robot.handleInboundMessage(groupCtx(openid, code, 'a3'))).content).toContain('部门');
    expect((await robot.handleInboundMessage(groupCtx(openid, 'EC', 'a4'))).content).toContain('模式');
    expect((await robot.handleInboundMessage(groupCtx(openid, '1', 'a5'))).content).toContain('模块');
    expect((await robot.handleInboundMessage(groupCtx(openid, '1', 'a6'))).content).toContain('自证');
    expect((await robot.handleInboundMessage(groupCtx(openid, '无', 'a7'))).content).toContain('证据');
    expect((await robot.handleInboundMessage(groupCtx(openid, '跳过', 'a8'))).content).toContain('确认');

    const done = await robot.handleInboundMessage(groupCtx(openid, '确认', 'a9'));
    expect(done.kind).toBe('apply_ticket');
    expect(done.content).toContain('提交成功');
    expect(done.ticket_id).toBeTruthy();

    const queryCode = done.content.match(/[A-Z2-9]{8}/)?.[0];
    expect(queryCode).toBeTruthy();
    const status = await robot.handleInboundMessage(groupCtx(openid, `查询 ${queryCode}`, 'a10'));
    expect(status.content).toContain('工单');
    expect(status.content).toContain('状态');

    // 他人拿同一个查询码查不到（QQ 内不允许遍历他人工单）
    const foreign = await robot.handleInboundMessage(groupCtx('openid-apply-other', `查询 ${queryCode}`, 'a11'));
    expect(foreign.content).toContain('无法查询');
  });

  it('申请过程中回复「取消」作废草稿', async () => {
    const openid = 'openid-apply-2';
    await robot.handleInboundMessage(groupCtx(openid, '申请工单', 'c1'));
    const reply = await robot.handleInboundMessage(groupCtx(openid, '取消', 'c2'));
    expect(reply.content).toContain('已取消');
  });

  it('接洽码不属于当前用户时拒绝进入下一步', async () => {
    const openid = 'openid-apply-3';
    const other = 'openid-apply-4';
    await robot.handleInboundMessage(groupCtx(other, '拿接洽码', 'x0'));
    const foreignCode = boundCodeOf(other);

    await robot.handleInboundMessage(groupCtx(openid, '申请工单', 'x1'));
    await robot.handleInboundMessage(groupCtx(openid, '冒用测试圈', 'x2'));
    const reply = await robot.handleInboundMessage(groupCtx(openid, foreignCode, 'x3'));
    expect(reply.content).toContain('不是你在机器人处领取的');
  });

  it('群内收到附件但下载失败时给出提示且不中断流程', async () => {
    const openid = 'openid-apply-5';
    await robot.handleInboundMessage(groupCtx(openid, '拿接洽码', 'd0'));
    const code = boundCodeOf(openid);
    await robot.handleInboundMessage(groupCtx(openid, '申请工单', 'd1'));
    await robot.handleInboundMessage(groupCtx(openid, '附件测试圈', 'd2'));
    await robot.handleInboundMessage(groupCtx(openid, code, 'd3'));
    await robot.handleInboundMessage(groupCtx(openid, 'EC', 'd4'));
    await robot.handleInboundMessage(groupCtx(openid, '1', 'd5'));
    await robot.handleInboundMessage(groupCtx(openid, '1', 'd6'));
    await robot.handleInboundMessage(groupCtx(openid, '无', 'd7'));

    const reply = await robot.handleInboundMessage({
      ...groupCtx(openid, '', 'd8'),
      attachments: [{ url: 'http://insecure.example/a.png', content_type: 'image/png' }],
    });
    expect(reply.content).toContain('未能保存');
  });
});