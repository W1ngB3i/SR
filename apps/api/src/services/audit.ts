import { getDb } from '../db/index.js';
import { newId, nowIso } from '../lib/ids.js';

export interface AuditActor {
  id: string | null;
  name: string;
}

export interface AuditInput {
  operator: AuditActor | null;
  action: string;
  resource: string;
  targetId: string;
  before?: string;
  after?: string;
  /** 额外描述，附加到 after 之后的 note 字段 */
  detail?: string;
  requestId?: string;
}

/** 追加操作日志：只增不删，作为争议仲裁与责任追溯依据 */
export function writeAudit(input: AuditInput): void {
  const after =
    input.detail && input.after !== undefined
      ? JSON.stringify({ ...(JSON.parse(input.after || '{}') as object), note: input.detail })
      : (input.after ?? '');
  getDb()
    .prepare(
      `INSERT INTO audit_log (id, operator_id, operator_name, action, resource, target_id, before, after, request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId('log'),
      input.operator?.id ?? null,
      input.operator?.name ?? '系统',
      input.action,
      input.resource,
      input.targetId,
      input.before ?? '',
      after,
      input.requestId ?? '',
      nowIso(),
    );
}

export interface AuditLogRow {
  id: string;
  operator_id: string | null;
  operator_name: string;
  action: string;
  resource: string;
  target_id: string;
  before: string;
  after: string;
  request_id: string;
  created_at: string;
}

export function listAuditLogs(filters: {
  action?: string;
  resource?: string;
  page: number;
  pageSize: number;
}): { items: AuditLogRow[]; total: number } {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.action) {
    where.push('action LIKE ?');
    params.push(`%${filters.action}%`);
  }
  if (filters.resource) {
    where.push('resource = ?');
    params.push(filters.resource);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM audit_log ${whereSql}`).get(...params) as { c: number }
  ).c;
  const items = db
    .prepare(`SELECT * FROM audit_log ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as AuditLogRow[];
  return { items, total };
}
