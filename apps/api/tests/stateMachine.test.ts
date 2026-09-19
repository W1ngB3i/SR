import { beforeAll, describe, expect, it } from 'vitest';
import { useTempDataDir } from './helpers.js';

useTempDataDir();

let seed: typeof import('../src/db/seed.js');
let ticket: typeof import('../src/services/ticket.js');
let dbMod: typeof import('../src/db/index.js');

beforeAll(async () => {
  seed = await import('../src/db/seed.js');
  ticket = await import('../src/services/ticket.js');
  dbMod = await import('../src/db/index.js');
  seed.seedDatabase(true);
});

const reviewerXingchen = { id: 'usr-xingchen', name: '星辰' };
const chiefWangbei = { id: 'usr-wangbei', name: '望北' };

const baseInput = {
  circle_name: '测试玩家',
  intention: 'SR_Party',
  department_id: 'dept-ec-intl',
  mode_id: 'mode-ec-dandao',
  module: 'PE' as const,
  self_proof: false,
  contact: 'QQ 99990000',
};

describe('工单状态机：提交 → 接单 → 回执 → 复核公示 全链路', () => {
  it('提交后进入待接单并返回查询码', () => {
    const result = ticket.createTicket({ ...baseInput }, []);
    expect(result.query_code).toMatch(/^[A-Z2-9]{8}$/);
    const detail = ticket.getTicketDetail(result.ticket_id, { id: 'usr-xingchen', role: 'reviewer' });
    expect(detail.status).toBe('pending_claim');
    expect(detail.circle_name).toBe('测试玩家');
  });

  it('接单后进入审核中，时间线记录接单事件', () => {
    const created = ticket.createTicket({ ...baseInput, circle_name: '接单链路' }, []);
    const claimed = ticket.claimTicket(created.ticket_id, reviewerXingchen);
    expect(claimed.status).toBe('reviewing');
    expect(claimed.assignee_name).toBe('星辰');
    const detail = ticket.getTicketDetail(created.ticket_id, { id: 'usr-xingchen', role: 'reviewer' });
    expect(detail.events.map((e) => e.type)).toContain('claimed');
  });

  it('提交回执缺成绩时按模块报字段错误', () => {
    const created = ticket.createTicket({ ...baseInput, circle_name: '缺成绩' }, []);
    ticket.claimTicket(created.ticket_id, reviewerXingchen);
    expect(() =>
      ticket.saveReceipt(
        created.ticket_id,
        { pe_grade: null, pc_grade: null, pass: true, target_department: '总部', comment: '', submit: true },
        reviewerXingchen,
      ),
    ).toThrowError(/回执字段不完整|PE 成绩/);
  });

  it('回执提交后进入已出结果，复核确认后公示', () => {
    const created = ticket.createTicket({ ...baseInput, circle_name: '全链路' }, []);
    ticket.claimTicket(created.ticket_id, reviewerXingchen);
    const resulted = ticket.saveReceipt(
      created.ticket_id,
      { pe_grade: 'A', pc_grade: null, pass: true, target_department: 'SR_Party EC&国际部门', comment: '通过', submit: true },
      reviewerXingchen,
    );
    expect(resulted.status).toBe('resulted');
    expect(resulted.receipt?.pe_grade).toBe('A');

    const published = ticket.reviewTicket(created.ticket_id, 'confirm', '', chiefWangbei);
    expect(published.status).toBe('published');
    const detail = ticket.getTicketDetail(created.ticket_id, { id: 'usr-wangbei', role: 'chief' });
    expect(detail.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['submitted', 'claimed', 'receipt_submitted', 'review_confirmed', 'published']),
    );
  });

  it('复核退回后回到审核中，可重新提交回执', () => {
    const created = ticket.createTicket({ ...baseInput, circle_name: '复核退回' }, []);
    ticket.claimTicket(created.ticket_id, reviewerXingchen);
    ticket.saveReceipt(
      created.ticket_id,
      { pe_grade: 'B', pc_grade: null, pass: true, target_department: '总部', comment: '', submit: true },
      reviewerXingchen,
    );
    const rejected = ticket.reviewTicket(created.ticket_id, 'reject', '评语与成绩不符', chiefWangbei);
    expect(rejected.status).toBe('reviewing');

    const reSubmitted = ticket.saveReceipt(
      created.ticket_id,
      { pe_grade: 'B', pc_grade: null, pass: true, target_department: '总部', comment: '已修正', submit: true },
      reviewerXingchen,
    );
    expect(reSubmitted.status).toBe('resulted');
  });

  it('退回补充材料后，申请人补交回到审核中', () => {
    const created = ticket.createTicket({ ...baseInput, circle_name: '补充链路' }, []);
    ticket.claimTicket(created.ticket_id, reviewerXingchen);
    const supplemented = ticket.requestSupplement(created.ticket_id, '请补充自证视频', reviewerXingchen);
    expect(supplemented.status).toBe('supplementing');

    const lookup = ticket.lookupTicket('补充链路', created.query_code);
    expect(lookup.ticket.supplement_reason).toBe('请补充自证视频');

    const resumed = ticket.provideSupplement(created.ticket_id, { circle_name: '补充链路', query_code: created.query_code }, '已补充', []);
    expect(resumed.status).toBe('reviewing');
  });

  it('冷却期内同圈名重复提交被拒绝', () => {
    ticket.createTicket({ ...baseInput, circle_name: '冷却玩家' }, []);
    expect(() => ticket.createTicket({ ...baseInput, circle_name: '冷却玩家' }, [])).toThrowError(
      /只能提交一条工单/,
    );
  });

  it('非法跳转：待接单直接公示被拒绝', () => {
    const created = ticket.createTicket({ ...baseInput, circle_name: '非法跳转' }, []);
    expect(() => ticket.publishTicket(created.ticket_id, chiefWangbei)).toThrowError(
      /回执尚未提交|不允许流转/,
    );
  });

  it('非本人无法查询进度', () => {
    const created = ticket.createTicket({ ...baseInput, circle_name: '查询校验' }, []);
    expect(() => ticket.lookupTicket('错误圈名', created.query_code)).toThrowError(/不匹配/);
    expect(() => ticket.lookupTicket('查询校验', 'AAAAAAAA')).toThrowError(/不匹配/);
  });
});

describe('数据库回滚', () => {
  it('受约束的模式删除被拒绝并保留数据', () => {
    const db = dbMod.getDb();
    const before = (db.prepare('SELECT COUNT(*) AS c FROM mode').get() as { c: number }).c;
    // mode-javahi-crystals 被演示工单引用，直接 SQL 删除应触发外键约束
    expect(() => db.prepare(`DELETE FROM mode WHERE id = 'mode-javahi-crystals'`).run()).toThrowError();
    const after = (db.prepare('SELECT COUNT(*) AS c FROM mode').get() as { c: number }).c;
    expect(after).toBe(before);
  });
});
