import { beforeAll, describe, expect, it } from 'vitest';
import { useTempDataDir } from './helpers.js';

useTempDataDir();

let seed: typeof import('../src/db/seed.js');
let ticket: typeof import('../src/services/ticket.js');
let appeal: typeof import('../src/services/appeal.js');
let config: typeof import('../src/services/config.js');
let db: typeof import('../src/db/index.js');

beforeAll(async () => {
  seed = await import('../src/db/seed.js');
  ticket = await import('../src/services/ticket.js');
  appeal = await import('../src/services/appeal.js');
  config = await import('../src/services/config.js');
  db = await import('../src/db/index.js');
  seed.seedDatabase(true);
  // 种子数据已占用星辰部分在办额度，调高上限避免本套件批量接单被拦
  config.setConfig('reviewer_max_concurrent', 99, null);
});

const xingchen = { id: 'usr-xingchen', name: '星辰', role: 'reviewer' as const };
const wangbei = { id: 'usr-wangbei', name: '望北', role: 'chief' as const };
const yuye = { id: 'usr-yuye', name: '雨夜', role: 'deputy' as const };

function createPending(name: string) {
  return ticket.createTicket(
    {
      circle_name: name,
      intention: 'SR_Party',
      department_id: 'dept-ec-intl',
      mode_id: 'mode-ec-dandao',
      module: 'PE',
      self_proof: false,
      contact: 'QQ 88880001',
    },
    [],
  );
}

describe('总管/副总管全权：回执与复核', () => {
  it('总管可代为提交他人负责工单的回执', () => {
    const t = createPending('全权回执一');
    ticket.claimTicket(t.ticket_id, xingchen);
    const detail = ticket.saveReceipt(
      t.ticket_id,
      { pe_grade: 'S', pc_grade: null, pass: true, target_department: 'SR_Party', comment: '', submit: true },
      wangbei,
    );
    expect(detail.status).toBe('resulted');
    expect(detail.receipt?.auditor_name).toBe('望北');
  });

  it('副总管可修订已出结果工单的回执且状态保持不变', () => {
    const t = createPending('全权回执二');
    ticket.claimTicket(t.ticket_id, xingchen);
    ticket.saveReceipt(
      t.ticket_id,
      { pe_grade: 'A', pc_grade: null, pass: true, target_department: 'SR_Party', comment: '', submit: true },
      xingchen,
    );
    const before = ticket.getTicketDetail(t.ticket_id, { id: wangbei.id, role: 'chief' });
    const revised = ticket.saveReceipt(
      t.ticket_id,
      { pe_grade: 'S+', pc_grade: null, pass: true, target_department: '总部', comment: '总管修订', submit: true },
      yuye,
    );
    expect(revised.status).toBe('resulted');
    expect(revised.receipt?.pe_grade).toBe('S+');
    expect(before.status).toBe('resulted');
    // 时间线应记录回执修订事件
    expect(revised.events.some((e) => e.type === 'receipt_revised' && e.actor_name === '雨夜')).toBe(true);
  });

  it('总管可直接修订已公示工单的回执，公示数据即时更新', () => {
    const t = createPending('全权公示修订');
    ticket.claimTicket(t.ticket_id, xingchen);
    ticket.saveReceipt(
      t.ticket_id,
      { pe_grade: 'B', pc_grade: null, pass: false, target_department: 'SR_Party', comment: '误判', submit: true },
      xingchen,
    );
    ticket.publishTicket(t.ticket_id, wangbei);
    const revised = ticket.saveReceipt(
      t.ticket_id,
      { pe_grade: 'A', pc_grade: null, pass: true, target_department: 'SR_Party', comment: '补判证据后修正', submit: true },
      wangbei,
    );
    expect(revised.status).toBe('published');
    expect(revised.receipt?.pass).toBe(true);
    const published = ticket.listPublished({ page: 1, pageSize: 50 });
    const hit = published.items.find((x) => x.id === t.ticket_id);
    expect(hit?.pass).toBe(true);
    expect(hit?.pe_grade).toBe('A');
  });

  it('已公示工单不支持草稿修订', () => {
    const t = createPending('公示禁止草稿');
    ticket.claimTicket(t.ticket_id, xingchen);
    ticket.saveReceipt(
      t.ticket_id,
      { pe_grade: 'B', pc_grade: null, pass: false, target_department: 'SR_Party', comment: '', submit: true },
      xingchen,
    );
    ticket.publishTicket(t.ticket_id, wangbei);
    expect(() =>
      ticket.saveReceipt(
        t.ticket_id,
        { pe_grade: 'C', pc_grade: null, pass: false, comment: '', submit: false },
        wangbei,
      ),
    ).toThrowError(/仅支持修订提交/);
  });

  it('审核员仍只能编辑自己负责的回执', () => {
    const t = createPending('越权拦截');
    ticket.claimTicket(t.ticket_id, xingchen);
    expect(() =>
      ticket.saveReceipt(
        t.ticket_id,
        { pe_grade: 'A', pc_grade: null, pass: true, target_department: 'X', comment: '', submit: true },
        { id: 'usr-liuyun', name: '流云', role: 'reviewer' },
      ),
    ).toThrowError(/只能填写自己负责/);
  });

  it('副总管可退回任意审核中工单补充材料', () => {
    const t = createPending('全权退回');
    ticket.claimTicket(t.ticket_id, xingchen);
    const after = ticket.requestSupplement(t.ticket_id, '材料不清晰', yuye);
    expect(after.status).toBe('supplementing');
  });
});

describe('总管/副总管全权：工单管理', () => {
  it('修订工单基础信息并校验部门模式匹配', () => {
    const t = createPending('信息修订');
    const detail = ticket.updateTicketInfo(
      t.ticket_id,
      { circle_name: '信息修订改', contact: 'QQ 12345678', self_proof: true },
      wangbei,
    );
    expect(detail.circle_name).toBe('信息修订改');
    expect(detail.self_proof).toBe(true);
    expect(detail.events.some((e) => e.type === 'ticket_updated')).toBe(true);
    // 模式与部门不匹配时拒绝
    expect(() =>
      ticket.updateTicketInfo(t.ticket_id, { mode_id: 'mode-lianda-ffa' }, wangbei),
    ).toThrowError(/不匹配/);
  });

  it('撤销公示后回到已出结果，可修订再重新公示', () => {
    const t = createPending('撤销公示');
    ticket.claimTicket(t.ticket_id, xingchen);
    ticket.saveReceipt(
      t.ticket_id,
      { pe_grade: 'A', pc_grade: null, pass: true, target_department: 'SR_Party', comment: '', submit: true },
      xingchen,
    );
    ticket.publishTicket(t.ticket_id, wangbei);
    const after = ticket.unpublishTicket(t.ticket_id, yuye);
    expect(after.status).toBe('resulted');
    expect(after.published_at).toBeNull();
    expect(() => ticket.unpublishTicket(t.ticket_id, wangbei)).toThrowError(/仅已公示/);
    const republished = ticket.publishTicket(t.ticket_id, wangbei);
    expect(republished.status).toBe('published');
  });

  it('删除工单级联清理记录且不可恢复', () => {
    const t = createPending('删除工单');
    ticket.claimTicket(t.ticket_id, xingchen);
    ticket.deleteTicket(t.ticket_id, wangbei);
    expect(() => ticket.getTicketDetail(t.ticket_id, { id: wangbei.id, role: 'chief' })).toThrowError(/不存在/);
    const events = (db.getDb().prepare('SELECT COUNT(*) AS c FROM ticket_event WHERE ticket_id = ?').get(t.ticket_id) as { c: number }).c;
    expect(events).toBe(0);
    expect(() => ticket.deleteTicket(t.ticket_id, wangbei)).toThrowError(/不存在/);
  });
});

describe('申诉链路', () => {
  it('申请人提交申诉 → 管理端处理', () => {
    const t = createPending('申诉工单');
    const created = appeal.createAppeal(
      t.ticket_id,
      { circle_name: '申诉工单', query_code: t.query_code },
      { reason: '成绩判定与实际表现不符，请求复核', contact: 'QQ 77777' },
    );
    expect(created.status).toBe('open');
    // 同一工单不允许重复提交待处理申诉
    expect(() =>
      appeal.createAppeal(
        t.ticket_id,
        { circle_name: '申诉工单', query_code: t.query_code },
        { reason: '重复申诉应当被拒绝' },
      ),
    ).toThrowError(/待处理的申诉/);
    // 身份不匹配拒绝
    expect(() =>
      appeal.createAppeal(
        t.ticket_id,
        { circle_name: '申诉工单', query_code: 'AAAAAAAA' },
        { reason: '错误查询码的申诉' },
      ),
    ).toThrowError(/不匹配/);

    const handled = appeal.handleAppeal(created.id, 'resolve', '已安排重审', wangbei);
    expect(handled.status).toBe('resolved');
    expect(handled.handled_by_name).toBe('望北');
    // 已处理申诉不可重复处理
    expect(() => appeal.handleAppeal(created.id, 'dismiss', '', yuye)).toThrowError(/已被处理/);
  });
});
