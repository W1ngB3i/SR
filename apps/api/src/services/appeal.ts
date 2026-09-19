import type { AppealDTO, AppealStatus } from '@sr/shared';
import { getDb } from '../db/index.js';
import { ApiError } from '../lib/errors.js';
import { newId, nowIso } from '../lib/ids.js';
import { writeAudit, type AuditActor } from './audit.js';
import type { StaffActor } from './ticket.js';

interface AppealRow {
  id: string;
  ticket_id: string;
  reason: string;
  contact: string;
  status: AppealStatus;
  handle_note: string;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  circle_name: string;
  department_name: string;
  mode_name: string;
  handled_by_name: string | null;
}

const BASE_SELECT = `
  SELECT a.*, t.circle_name, d.name AS department_name, m.name AS mode_name, u.name AS handled_by_name
  FROM appeal a
  JOIN ticket t ON t.id = a.ticket_id
  JOIN department d ON d.id = t.department_id
  JOIN mode m ON m.id = t.mode_id
  LEFT JOIN "user" u ON u.id = a.handled_by
`;

function toDto(row: AppealRow): AppealDTO {
  return {
    id: row.id,
    ticket_id: row.ticket_id,
    circle_name: row.circle_name,
    department_name: row.department_name,
    mode_name: row.mode_name,
    status: row.status,
    reason: row.reason,
    contact: row.contact,
    handle_note: row.handle_note,
    handled_by_name: row.handled_by_name,
    handled_at: row.handled_at,
    created_at: row.created_at,
  };
}

/**
 * 申请人提交申诉：凭圈名 + 查询码校验身份；同一工单存在待处理申诉时不允许重复提交。
 * 申诉为工单子记录，不改变工单状态机。
 */
export function createAppeal(
  ticketId: string,
  identity: { circle_name: string; query_code: string },
  input: { reason: string; contact?: string },
): AppealDTO {
  const db = getDb();
  return db.transaction((): AppealDTO => {
    const ticket = db
      .prepare('SELECT id, circle_name, query_code FROM ticket WHERE id = ?')
      .get(ticketId) as { id: string; circle_name: string; query_code: string } | undefined;
    if (!ticket || ticket.circle_name !== identity.circle_name.trim() || ticket.query_code !== identity.query_code.trim()) {
      throw ApiError.notFound('INVALID_QUERY_CODE', '圈名与查询码不匹配，无法提交申诉');
    }
    const openExists = db
      .prepare(`SELECT id FROM appeal WHERE ticket_id = ? AND status = 'open' LIMIT 1`)
      .get(ticketId);
    if (openExists) {
      throw ApiError.conflict('RESOURCE_CONFLICT', '该工单已有待处理的申诉，请耐心等待处理结果');
    }
    const id = newId('apl');
    db.prepare(
      `INSERT INTO appeal (id, ticket_id, reason, contact, status, created_at)
       VALUES (?, ?, ?, ?, 'open', ?)`,
    ).run(id, ticketId, input.reason, input.contact?.trim() ?? '', nowIso());
    writeAudit({
      operator: { id: null, name: ticket.circle_name },
      action: 'appeal.submit',
      resource: 'appeal',
      targetId: id,
      after: JSON.stringify({ ticket_id: ticketId }),
      detail: '申请人提交申诉',
    });
    const row = db.prepare(`${BASE_SELECT} WHERE a.id = ?`).get(id) as AppealRow | undefined;
    return toDto(row!);
  })();
}

/** 申诉列表（管理端），可按状态筛选 */
export function listAppeals(filters: {
  status?: string;
  page: number;
  pageSize: number;
}): { items: AppealDTO[]; page: number; page_size: number; total: number } {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status && ['open', 'resolved', 'dismissed'].includes(filters.status)) {
    where.push('a.status = ?');
    params.push(filters.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM appeal a ${whereSql}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(`${BASE_SELECT} ${whereSql} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`)
    .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as AppealRow[];
  return { items: rows.map(toDto), page: filters.page, page_size: filters.pageSize, total };
}

/** 处理申诉：采纳 / 驳回，记录处理人与说明 */
export function handleAppeal(
  id: string,
  action: 'resolve' | 'dismiss',
  note: string,
  actor: StaffActor,
): AppealDTO {
  const db = getDb();
  return db.transaction((): AppealDTO => {
    const row = db.prepare(`${BASE_SELECT} WHERE a.id = ?`).get(id) as AppealRow | undefined;
    if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '申诉记录不存在');
    if (row.status !== 'open') {
      throw ApiError.conflict('RESOURCE_CONFLICT', '该申诉已被处理');
    }
    const status: AppealStatus = action === 'resolve' ? 'resolved' : 'dismissed';
    db.prepare(
      `UPDATE appeal SET status = ?, handle_note = ?, handled_by = ?, handled_at = ? WHERE id = ? AND status = 'open'`,
    ).run(status, note, actor.id, nowIso(), id);
    writeAudit({
      operator: actor,
      action: 'appeal.handle',
      resource: 'appeal',
      targetId: id,
      before: JSON.stringify({ status: row.status }),
      after: JSON.stringify({ status, note }),
      detail: `${status === 'resolved' ? '采纳' : '驳回'}申诉：${row.circle_name}`,
    });
    const after = db.prepare(`${BASE_SELECT} WHERE a.id = ?`).get(id) as AppealRow;
    return toDto(after);
  })();
}
