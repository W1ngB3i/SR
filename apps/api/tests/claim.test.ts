import { beforeAll, describe, expect, it } from 'vitest';
import { useTempDataDir } from './helpers.js';

useTempDataDir();

let seed: typeof import('../src/db/seed.js');
let ticket: typeof import('../src/services/ticket.js');
let config: typeof import('../src/services/config.js');

beforeAll(async () => {
  seed = await import('../src/db/seed.js');
  ticket = await import('../src/services/ticket.js');
  config = await import('../src/services/config.js');
  seed.seedDatabase(true);
});

const xingchen = { id: 'usr-xingchen', name: '星辰' };
const liuyun = { id: 'usr-liuyun', name: '流云' };

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

describe('接单并发与限额', () => {
  it('同一工单第二个接单人收到 TICKET_ALREADY_CLAIMED', () => {
    const t = createPending('并发测试一');
    const first = ticket.claimTicket(t.ticket_id, xingchen);
    expect(first.assignee_id).toBe('usr-xingchen');
    expect(() => ticket.claimTicket(t.ticket_id, liuyun)).toThrowError(/已被接走/);
    const detail = ticket.getTicketDetail(t.ticket_id, { id: 'usr-xingchen', role: 'reviewer' });
    expect(detail.assignee_name).toBe('星辰');
  });

  it('达到同时处理上限后接单被拒绝', async () => {
    const max = config.getConfig('reviewer_max_concurrent');
    expect(max).toBeGreaterThan(0);
    // 流云种子中已有若干在办工单，先补满剩余额度
    const db = (await import('../src/db/index.js')).getDb();
    const activeNow = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM ticket WHERE assignee_id = ? AND status IN ('reviewing','supplementing')`,
        )
        .get(liuyun.id) as { c: number }
    ).c;
    for (let i = 0; i < max - activeNow; i++) {
      const t = createPending(`限额填充${i}`);
      ticket.claimTicket(t.ticket_id, liuyun);
    }
    const overflow = createPending('超额工单');
    expect(() => ticket.claimTicket(overflow.ticket_id, liuyun)).toThrowError(/上限/);
    // 其他审核员不受影响
    const other = ticket.claimTicket(overflow.ticket_id, xingchen);
    expect(other.assignee_id).toBe('usr-xingchen');
  });

  it('总管释放后工单回到公单池', () => {
    const t = createPending('释放测试');
    ticket.claimTicket(t.ticket_id, xingchen);
    const released = ticket.releaseTicket(t.ticket_id, '长时间未处理', { id: 'usr-wangbei', name: '望北' });
    expect(released.status).toBe('pending_claim');
    expect(released.assignee_id).toBeNull();
  });
});
