import {
  BizCode,
  type AttachmentDTO,
  type Page,
  type PublicityItemDTO,
  type ReceiptDTO,
  type StatsDTO,
  type TicketDetailDTO,
  type TicketEventDTO,
  type TicketSummaryDTO,
  type SubmitTicketInput,
  type TicketInfoUpdateInput,
  desensitizeName,
  hoursBetween,
  type Grade,
  type TicketEventType,
  type TicketStatus,
  type DeviceModule,
  type StaffRole,
} from '@sr/shared';
import type { Express } from 'express';
import fs from 'node:fs';
import { getDb } from '../db/index.js';
import { ApiError } from '../lib/errors.js';
import { genQueryCode, newId, nowIso } from '../lib/ids.js';
import { writeAudit, type AuditActor } from './audit.js';
import { getConfig } from './config.js';
import { attachmentPhysicalPath, attachmentsForTicket, cleanupFiles, saveAttachmentMeta } from './storage.js';

interface TicketRow {
  id: string;
  query_code: string;
  circle_name: string;
  department_id: string;
  module: DeviceModule;
  mode_id: string;
  self_proof: 0 | 1;
  contact: string;
  status: TicketStatus;
  assignee_id: string | null;
  is_priority: 0 | 1;
  supplement_reason: string;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  resulted_at: string | null;
  published_at: string | null;
}

interface JoinedRow extends TicketRow {
  department_name: string;
  mode_name: string;
  mode_group: string;
  assignee_name: string | null;
}

const BASE_SELECT = `
  SELECT t.*, d.name AS department_name, m.name AS mode_name, m.group_name AS mode_group, u.name AS assignee_name
  FROM ticket t
  JOIN department d ON d.id = t.department_id
  JOIN mode m ON m.id = t.mode_id
  LEFT JOIN "user" u ON u.id = t.assignee_id
`;

function toSummary(row: JoinedRow): TicketSummaryDTO {
  return {
    id: row.id,
    circle_name: row.circle_name,
    department_id: row.department_id,
    department_name: row.department_name,
    module: row.module,
    mode_id: row.mode_id,
    mode_name: row.mode_name,
    mode_group: row.mode_group,
    self_proof: row.self_proof === 1,
    status: row.status,
    assignee_id: row.assignee_id,
    assignee_name: row.assignee_name,
    is_priority: row.is_priority === 1,
    supplement_reason: row.supplement_reason,
    created_at: row.created_at,
    claimed_at: row.claimed_at,
    resulted_at: row.resulted_at,
    published_at: row.published_at,
  };
}

function getJoinedRow(id: string): JoinedRow | null {
  return (getDb().prepare(`${BASE_SELECT} WHERE t.id = ?`).get(id) as JoinedRow | undefined) ?? null;
}

function addEvent(
  ticketId: string,
  type: TicketEventType,
  actor: AuditActor | null,
  detail = '',
): void {
  getDb()
    .prepare(
      `INSERT INTO ticket_event (id, ticket_id, type, actor_id, actor_name, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(newId('evt'), ticketId, type, actor?.id ?? null, actor?.name ?? '系统', detail, nowIso());
}

function loadEvents(ticketId: string): TicketEventDTO[] {
  return getDb()
    .prepare('SELECT * FROM ticket_event WHERE ticket_id = ? ORDER BY created_at ASC, id ASC')
    .all(ticketId) as TicketEventDTO[];
}

interface ReceiptRow {
  ticket_id: string;
  is_draft: 0 | 1;
  pe_grade: Grade | null;
  pc_grade: Grade | null;
  pass: 0 | 1 | null;
  target_department: string;
  auditor_id: string | null;
  comment: string;
  submitted_at: string | null;
}

function loadReceipt(ticketId: string): ReceiptDTO | null {
  const row = getDb().prepare('SELECT * FROM receipt WHERE ticket_id = ?').get(ticketId) as
    | ReceiptRow
    | undefined;
  if (!row) return null;
  const auditor = row.auditor_id
    ? ((getDb().prepare('SELECT name FROM "user" WHERE id = ?').get(row.auditor_id) as { name: string } | undefined)?.name ?? null)
    : null;
  return {
    ticket_id: row.ticket_id,
    is_draft: row.is_draft === 1,
    pe_grade: row.pe_grade,
    pc_grade: row.pc_grade,
    pass: row.pass === null ? null : row.pass === 1,
    target_department: row.target_department,
    comment: row.comment,
    auditor_id: row.auditor_id,
    auditor_name: auditor,
    submitted_at: row.submitted_at,
  };
}

/** 校验状态跳转符合共享状态机 */
function assertTransition(from: TicketStatus, to: TicketStatus): void {
  const allowed: Record<string, TicketStatus[]> = {
    pending_claim: ['reviewing'],
    reviewing: ['supplementing', 'resulted', 'pending_claim'],
    supplementing: ['reviewing', 'pending_claim'],
    resulted: ['reviewing', 'published'],
    published: [],
  };
  if (!allowed[from]?.includes(to)) {
    throw ApiError.conflict(BizCode.InvalidTransition, `工单当前状态为「${from}」，不允许流转到「${to}」`);
  }
}

// ---------------------------------------------------------------------------
// 提交与查询（申请人侧，公开接口）
// ---------------------------------------------------------------------------

export function createTicket(
  input: SubmitTicketInput,
  files: Express.Multer.File[],
): { ticket_id: string; query_code: string } {
  const db = getDb();
  const cooldownHours = getConfig('submission_cooldown_hours');

  // 冷却期：同一圈名在窗口期内仅允许提交一条，防止刷单
  if (cooldownHours > 0) {
    const since = new Date(Date.now() - cooldownHours * 3_600_000).toISOString();
    const recent = db
      .prepare('SELECT id, created_at FROM ticket WHERE circle_name = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1')
      .get(input.circle_name, since) as { id: string } | undefined;
    if (recent) {
      throw ApiError.conflict(
        BizCode.CooldownActive,
        `同一圈名 ${cooldownHours} 小时内只能提交一条工单，请稍后再试`,
      );
    }
  }

  // 校验部门/模式存在且启用，模式必须属于所选部门
  const dept = db.prepare('SELECT * FROM department WHERE id = ? AND enabled = 1').get(input.department_id) as
    | { id: string }
    | undefined;
  if (!dept) {
    throw ApiError.badRequest(BizCode.InvalidInput, '审核部门不存在或已停用', { department_id: ['请重新选择部门'] });
  }
  const mode = db
    .prepare('SELECT * FROM mode WHERE id = ? AND department_id = ?')
    .get(input.mode_id, input.department_id) as { id: string } | undefined;
  if (!mode) {
    throw ApiError.badRequest(BizCode.InvalidInput, '审核模式与所选部门不匹配', { mode_id: ['请重新选择模式'] });
  }

  const id = newId('tkt');
  let queryCode = genQueryCode();
  for (let i = 0; i < 5; i++) {
    const clash = db.prepare('SELECT id FROM ticket WHERE query_code = ?').get(queryCode);
    if (!clash) break;
    queryCode = genQueryCode();
  }
  const now = nowIso();

  db.transaction(() => {
    // 一次性接洽码：原子消耗，失败即拒绝提交（防并发重复使用）
    const consumed = db
      .prepare(
        `UPDATE contact_key SET status = 'used', used_ticket_id = ?, used_at = ?
         WHERE code = ? AND status = 'unused'`,
      )
      .run(id, now, input.contact);
    if (consumed.changes !== 1) {
      throw ApiError.badRequest(BizCode.InvalidInput, '接洽码无效或已被使用，请向审核员重新索取', {
        contact: ['接洽码无效或已被使用'],
      });
    }
    db.prepare(
      `INSERT INTO ticket (id, query_code, circle_name, department_id, module, mode_id, self_proof, contact, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_claim', ?, ?)`,
    ).run(id, queryCode, input.circle_name, input.department_id, input.module, input.mode_id, input.self_proof ? 1 : 0, input.contact, now, now);
    for (const file of files) saveAttachmentMeta(id, file);
    addEvent(id, 'submitted', { id: null, name: input.circle_name }, files.length > 0 ? `附带 ${files.length} 份证据` : '未上传自证材料');
    writeAudit({
      operator: { id: null, name: input.circle_name },
      action: 'ticket.create',
      resource: 'ticket',
      targetId: id,
      after: JSON.stringify({ department_id: input.department_id }),
      detail: '提交工单',
    });
  })();

  return { ticket_id: id, query_code: queryCode };
}

export function lookupTicket(circleName: string, queryCode: string): {
  ticket: TicketSummaryDTO;
  receipt: ReceiptDTO | null;
  events: TicketEventDTO[];
} {
  const row = getDb()
    .prepare(`${BASE_SELECT} WHERE t.query_code = ? AND t.circle_name = ?`)
    .get(queryCode, circleName) as JoinedRow | undefined;
  if (!row) {
    throw ApiError.notFound(BizCode.InvalidQueryCode, '圈名与查询码不匹配，请核对后重试');
  }
  return {
    ticket: toSummary(row),
    receipt: loadReceipt(row.id),
    events: loadEvents(row.id),
  };
}

/** 申请人补充材料：校验身份后回到审核中 */
export function provideSupplement(
  ticketId: string,
  identity: { circle_name: string; query_code: string },
  note: string,
  files: Express.Multer.File[],
): TicketSummaryDTO {
  const db = getDb();
  const row = getDb().prepare(`${BASE_SELECT} WHERE t.id = ?`).get(ticketId) as JoinedRow | undefined;
  if (!row || row.circle_name !== identity.circle_name.trim() || row.query_code !== identity.query_code.trim()) {
    throw ApiError.notFound(BizCode.InvalidQueryCode, '圈名与查询码不匹配，无法补充材料');
  }
  if (row.status !== 'supplementing') {
    throw ApiError.conflict(BizCode.InvalidTransition, '工单当前不在补充材料状态');
  }
  db.transaction(() => {
    db.prepare(
      `UPDATE ticket SET status = 'reviewing', updated_at = ? WHERE id = ? AND status = 'supplementing'`,
    ).run(nowIso(), ticketId);
    for (const file of files) saveAttachmentMeta(ticketId, file);
    addEvent(
      ticketId,
      'supplement_provided',
      { id: null, name: row.circle_name },
      [files.length > 0 ? `补充 ${files.length} 份材料` : '未补充材料', note].filter(Boolean).join('；'),
    );
  })();
  return toSummary(getJoinedRow(ticketId)!);
}

// ---------------------------------------------------------------------------
// 工单池与工作台（审核员侧）
// ---------------------------------------------------------------------------

export interface TicketListFilters {
  status?: string[];
  department_id?: string;
  mode_id?: string;
  module?: string;
  keyword?: string;
  mine?: boolean;
  page: number;
  pageSize: number;
}

export function listTickets(
  filters: TicketListFilters,
  viewer: { id: string; role: StaffRole },
): Page<TicketSummaryDTO> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status?.length) {
    where.push(`t.status IN (${filters.status.map(() => '?').join(',')})`);
    params.push(...filters.status);
  }
  if (filters.department_id) {
    where.push('t.department_id = ?');
    params.push(filters.department_id);
  }
  if (filters.mode_id) {
    where.push('t.mode_id = ?');
    params.push(filters.mode_id);
  }
  if (filters.module) {
    where.push('t.module = ?');
    params.push(filters.module);
  }
  if (filters.keyword) {
    where.push('t.circle_name LIKE ?');
    params.push(`%${filters.keyword}%`);
  }
  if (filters.mine) {
    where.push('t.assignee_id = ?');
    params.push(viewer.id);
  } else if (viewer.role === 'reviewer') {
    // 审核员可见：待接单公单池 + 自己负责的工单
    where.push(`(t.status = 'pending_claim' OR t.assignee_id = ?)`);
    params.push(viewer.id);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM ticket t ${whereSql}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(
      `${BASE_SELECT} ${whereSql} ORDER BY t.is_priority DESC, t.created_at ASC LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as JoinedRow[];
  return { items: rows.map(toSummary), page: filters.page, page_size: filters.pageSize, total };
}

export function getTicketDetail(
  id: string,
  viewer: { id: string; role: 'reviewer' | 'deputy' | 'chief' | 'admin' },
): TicketDetailDTO {
  const row = getJoinedRow(id);
  if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
  if (viewer.role === 'reviewer') {
    const own = row.assignee_id === viewer.id || row.status === 'pending_claim';
    if (!own) throw ApiError.forbidden('只能查看待接单工单或自己负责的工单');
  }
  return {
    ...toSummary(row),
    contact: row.contact,
    events: loadEvents(id),
    receipt: loadReceipt(id),
    attachments: [],
  };
}

/** 接单：事务内先校验再原子更新，状态不是待接单则拒绝（并发双保险） */
export function claimTicket(id: string, actor: AuditActor & { id: string }): TicketSummaryDTO {
  const db = getDb();
  const max = getConfig('reviewer_max_concurrent');
  return db.transaction((): TicketSummaryDTO => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
    if (row.status !== 'pending_claim') {
      throw ApiError.conflict(BizCode.TicketAlreadyClaimed, '该工单已被接走，请刷新工单池');
    }
    const active = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM ticket WHERE assignee_id = ? AND status IN ('reviewing','supplementing')`)
        .get(actor.id) as { c: number }
    ).c;
    if (active >= max) {
      throw ApiError.conflict(BizCode.LimitReached, `同时处理上限为 ${max} 条，请先完成手头工单`);
    }
    const result = db
      .prepare(
        `UPDATE ticket SET status = 'reviewing', assignee_id = ?, claimed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending_claim'`,
      )
      .run(actor.id, nowIso(), nowIso(), id);
    if (result.changes !== 1) {
      throw ApiError.conflict(BizCode.TicketAlreadyClaimed, '该工单已被接走，请刷新工单池');
    }
    addEvent(id, 'claimed', actor, `由 ${actor.name} 接单`);
    writeAudit({
      operator: actor,
      action: 'ticket.claim',
      resource: 'ticket',
      targetId: id,
      detail: `接单：${row.circle_name}（${row.department_name}）`,
    });
    return toSummary(getJoinedRow(id)!);
  })();
}

/** 总管指派：指派后不再出现在公单池 */
export function assignTicket(id: string, assigneeId: string, actor: AuditActor & { id: string }): TicketSummaryDTO {
  const db = getDb();
  const target = db.prepare('SELECT * FROM "user" WHERE id = ?').get(assigneeId) as
    | { id: string; name: string; role: string; status: string }
    | undefined;
  if (!target || target.status !== 'active' || !['reviewer', 'deputy', 'chief'].includes(target.role)) {
    throw ApiError.badRequest(BizCode.InvalidInput, '被指派人不是在职审核人员');
  }
  return db.transaction((): TicketSummaryDTO => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
    assertTransition(row.status, 'reviewing');
    const result = db
      .prepare(
        `UPDATE ticket SET status = 'reviewing', assignee_id = ?, claimed_at = COALESCE(claimed_at, ?), updated_at = ?
         WHERE id = ? AND status = 'pending_claim'`,
      )
      .run(assigneeId, nowIso(), nowIso(), id);
    if (result.changes !== 1) throw ApiError.conflict(BizCode.TicketAlreadyClaimed, '工单已被接走，无法指派');
    addEvent(id, 'assigned', actor, `指派给 ${target.name}`);
    writeAudit({
      operator: actor,
      action: 'ticket.assign',
      resource: 'ticket',
      targetId: id,
      detail: `指派给 ${target.name}`,
    });
    return toSummary(getJoinedRow(id)!);
  })();
}

/** 总管释放：审核中/补充中的工单放回公单池 */
export function releaseTicket(id: string, reason: string, actor: AuditActor & { id: string }): TicketSummaryDTO {
  const db = getDb();
  return db.transaction((): TicketSummaryDTO => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
    assertTransition(row.status, 'pending_claim');
    db.prepare(
      `UPDATE ticket SET status = 'pending_claim', assignee_id = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?`,
    ).run(nowIso(), id);
    addEvent(id, 'released', actor, reason || '由总管释放回公单池');
    writeAudit({
      operator: actor,
      action: 'ticket.release',
      resource: 'ticket',
      targetId: id,
      detail: `释放回公单池：${reason || '无说明'}`,
    });
    return toSummary(getJoinedRow(id)!);
  })();
}

/** 总管置顶优先工单 */
export function togglePin(id: string, actor: AuditActor & { id: string }): TicketSummaryDTO {
  const db = getDb();
  const row = getJoinedRow(id);
  if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
  db.prepare('UPDATE ticket SET is_priority = ?, updated_at = ? WHERE id = ?').run(
    row.is_priority === 1 ? 0 : 1,
    nowIso(),
    id,
  );
  writeAudit({
    operator: actor,
    action: 'ticket.pin',
    resource: 'ticket',
    targetId: id,
    detail: row.is_priority === 1 ? '取消优先标记' : '标记为优先工单',
  });
  return toSummary(getJoinedRow(id)!);
}

// ---------------------------------------------------------------------------
// 总管/副总管全权管理：修订工单信息 / 撤销公示 / 删除工单
// ---------------------------------------------------------------------------

/** 修订工单基础信息（圈名、接洽码、部门/模式、模块、自证标记） */
export function updateTicketInfo(
  id: string,
  patch: TicketInfoUpdateInput,
  actor: StaffActor,
): TicketDetailDTO {
  const db = getDb();
  return db.transaction((): TicketDetailDTO => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');

    const nextDept = patch.department_id ?? row.department_id;
    const dept = db.prepare('SELECT id FROM department WHERE id = ?').get(nextDept);
    if (!dept) {
      throw ApiError.badRequest(BizCode.InvalidInput, '目标部门不存在', { department_id: ['请重新选择部门'] });
    }
    const nextMode = patch.mode_id ?? row.mode_id;
    const mode = db.prepare('SELECT id FROM mode WHERE id = ? AND department_id = ?').get(nextMode, nextDept);
    if (!mode) {
      throw ApiError.badRequest(BizCode.InvalidInput, '审核模式与部门不匹配', { mode_id: ['请重新选择模式'] });
    }

    const changes: string[] = [];
    if (patch.circle_name !== undefined && patch.circle_name !== row.circle_name) changes.push(`圈名 ${row.circle_name} → ${patch.circle_name}`);
    if (patch.module !== undefined && patch.module !== row.module) changes.push(`模块 ${row.module} → ${patch.module}`);
    if (patch.department_id !== undefined && patch.department_id !== row.department_id) changes.push('所属部门');
    if (patch.mode_id !== undefined && patch.mode_id !== row.mode_id) changes.push('审核模式');
    if (patch.contact !== undefined && patch.contact !== row.contact) changes.push('接洽码');
    if (patch.self_proof !== undefined && patch.self_proof !== (row.self_proof === 1)) changes.push('自证标记');

    db.prepare(
      `UPDATE ticket SET
         circle_name = COALESCE(?, circle_name),
         contact = COALESCE(?, contact),
         department_id = COALESCE(?, department_id),
         mode_id = COALESCE(?, mode_id),
         module = COALESCE(?, module),
         self_proof = COALESCE(?, self_proof),
         updated_at = ?
       WHERE id = ?`,
    ).run(
      patch.circle_name ?? null,
      patch.contact ?? null,
      patch.department_id ?? null,
      patch.mode_id ?? null,
      patch.module ?? null,
      patch.self_proof === undefined ? null : patch.self_proof ? 1 : 0,
      nowIso(),
      id,
    );

    addEvent(id, 'ticket_updated', actor, changes.length ? `修订工单信息：${changes.join('、')}` : '修订工单信息（内容未变化）');
    writeAudit({
      operator: actor,
      action: 'ticket.update_info',
      resource: 'ticket',
      targetId: id,
      before: JSON.stringify({
        circle_name: row.circle_name,
        contact: row.contact,
        department_id: row.department_id,
        mode_id: row.mode_id,
        module: row.module,
        self_proof: row.self_proof === 1,
      }),
      after: JSON.stringify(patch),
      detail: `修订工单信息：${row.circle_name}`,
    });
    return getTicketDetail(id, actor);
  })();
}

/** 撤销公示：已公示 → 已出结果，可修订回执后重新公示 */
export function unpublishTicket(id: string, actor: StaffActor): TicketSummaryDTO {
  const db = getDb();
  return db.transaction((): TicketSummaryDTO => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
    if (row.status !== 'published') {
      throw ApiError.conflict(BizCode.InvalidTransition, '仅已公示的工单可以撤销公示');
    }
    const now = nowIso();
    db.prepare(
      `UPDATE ticket SET status = 'resulted', published_at = NULL, updated_at = ? WHERE id = ? AND status = 'published'`,
    ).run(now, id);
    addEvent(id, 'unpublished', actor, '撤销公示，工单回到「已出结果」');
    writeAudit({
      operator: actor,
      action: 'ticket.unpublish',
      resource: 'ticket',
      targetId: id,
      detail: `撤销公示：${row.circle_name}`,
    });
    return toSummary(getJoinedRow(id)!);
  })();
}

/** 删除工单：级联清理回执、时间线、附件记录与磁盘文件（不可恢复，仅总管/副总管） */
export function deleteTicket(id: string, actor: StaffActor): { ok: true } {
  const db = getDb();
  return db.transaction(() => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');

    const files = db.prepare('SELECT id FROM attachment WHERE ticket_id = ?').all(id) as Array<{ id: string }>;
    db.prepare('DELETE FROM appeal WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM receipt WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM ticket_event WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM attachment WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM ticket WHERE id = ?').run(id);

    for (const f of files) {
      const p = attachmentPhysicalPath(f.id);
      if (p) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* 磁盘文件缺失时忽略 */
        }
      }
    }

    writeAudit({
      operator: actor,
      action: 'ticket.delete',
      resource: 'ticket',
      targetId: id,
      before: JSON.stringify({
        circle_name: row.circle_name,
        status: row.status,
        department_name: row.department_name,
        mode_name: row.mode_name,
        assignee_name: row.assignee_name,
      }),
      detail: `删除工单：${row.circle_name}（${row.department_name}）`,
    });
    return { ok: true as const };
  })();
}

/** 退回补充材料：负责审核员操作；总管/副总管拥有全权，可退回任意审核中工单 */
export function requestSupplement(id: string, reason: string, actor: StaffActor): TicketSummaryDTO {
  const db = getDb();
  return db.transaction((): TicketSummaryDTO => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
    if (row.assignee_id !== actor.id && !isManagerRole(actor.role)) {
      throw ApiError.forbidden('只能操作自己负责的工单');
    }
    assertTransition(row.status, 'supplementing');
    db.prepare(
      `UPDATE ticket SET status = 'supplementing', supplement_reason = ?, updated_at = ? WHERE id = ?`,
    ).run(reason, nowIso(), id);
    addEvent(id, 'supplement_requested', actor, reason);
    writeAudit({
      operator: actor,
      action: 'ticket.supplement_request',
      resource: 'ticket',
      targetId: id,
      detail: `退回补充：${reason}`,
    });
    return toSummary(getJoinedRow(id)!);
  })();
}

// ---------------------------------------------------------------------------
// 回执与复核
// ---------------------------------------------------------------------------

export interface ReceiptInputService {
  pe_grade?: Grade | null;
  pc_grade?: Grade | null;
  pass?: boolean | null;
  target_department: string;
  comment: string;
  submit: boolean;
}

export interface StaffActor extends AuditActor {
  id: string;
  role: StaffRole;
}

function isManagerRole(role: StaffRole): boolean {
  return role === 'chief' || role === 'deputy';
}

/** 保存草稿 / 提交回执；提交时按工单模块校验成绩完整性 */
export function saveReceipt(id: string, input: ReceiptInputService, actor: StaffActor): TicketDetailDTO {
  const db = getDb();
  return db.transaction((): TicketDetailDTO => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
    const isMgr = isManagerRole(actor.role);
    // 审核员只能填自己负责的工单；总管/副总管拥有全权，可修订任意工单的回执
    if (row.assignee_id !== actor.id && !isMgr) {
      throw ApiError.forbidden('只能填写自己负责工单的回执');
    }
    if (row.status === 'published') {
      // 已公示工单：仅总管/副总管可直接修订，状态保持不变（修订后公示数据即时更新）
      if (!isMgr) throw ApiError.forbidden('已公示工单仅总管/副总管可修订回执');
      if (!input.submit) throw ApiError.conflict(BizCode.InvalidTransition, '已公示工单仅支持修订提交，不支持草稿');
    } else if (row.status !== 'reviewing' && row.status !== 'resulted') {
      throw ApiError.conflict(BizCode.InvalidTransition, '当前状态不能填写回执');
    }
    // 审核员在复核退回后重填：先将工单拉回审核中；总管修订已出结果工单时保持状态不动
    if (row.status === 'resulted' && !isMgr) {
      assertTransition(row.status, 'reviewing');
      db.prepare(`UPDATE ticket SET status = 'reviewing', resulted_at = NULL, updated_at = ? WHERE id = ?`).run(nowIso(), id);
    }

    const prior = db.prepare('SELECT is_draft FROM receipt WHERE ticket_id = ?').get(id) as
      | { is_draft: 0 | 1 }
      | undefined;
    const hadSubmitted = !!prior && prior.is_draft === 0;

    const details: Record<string, string[]> = {};
    if (input.submit) {
      if ((row.module === 'PE' || row.module === 'BOTH') && !input.pe_grade) {
        details.pe_grade = ['该工单包含 PE 端，请填写 PE 成绩'];
      }
      if ((row.module === 'PC' || row.module === 'BOTH') && !input.pc_grade) {
        details.pc_grade = ['该工单包含 PC 端，请填写 PC 成绩'];
      }
      if (input.pass === undefined || input.pass === null) {
        details.pass = ['请选择审核评价（通过 / 不通过）'];
      }
      if (input.pass === true && !input.target_department) {
        details.target_department = ['评价为通过时，请填写可进入的部门或总部'];
      }
      if (Object.keys(details).length > 0) {
        throw ApiError.badRequest(BizCode.FieldRequired, '回执字段不完整', details);
      }
    }

    const pass = input.pass === undefined || input.pass === null ? null : input.pass ? 1 : 0;
    const now = nowIso();
    db.prepare(
      `INSERT INTO receipt (ticket_id, is_draft, pe_grade, pc_grade, pass, target_department, auditor_id, comment, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticket_id) DO UPDATE SET
         is_draft = excluded.is_draft,
         pe_grade = excluded.pe_grade,
         pc_grade = excluded.pc_grade,
         pass = excluded.pass,
         target_department = excluded.target_department,
         auditor_id = excluded.auditor_id,
         comment = excluded.comment,
         submitted_at = excluded.submitted_at`,
    ).run(
      id,
      input.submit ? 0 : 1,
      input.pe_grade ?? null,
      input.pc_grade ?? null,
      pass,
      input.target_department,
      actor.id,
      input.comment,
      input.submit ? now : null,
    );

    if (input.submit) {
      if (row.status !== 'published') {
        db.prepare(`UPDATE ticket SET status = 'resulted', resulted_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);
      } else {
        db.prepare(`UPDATE ticket SET updated_at = ? WHERE id = ?`).run(now, id);
      }
      addEvent(
        id,
        hadSubmitted ? 'receipt_revised' : 'receipt_submitted',
        actor,
        hadSubmitted
          ? `由 ${actor.name} 修订回执`
          : input.pass
            ? `评价：通过${input.target_department ? `，可进入 ${input.target_department}` : ''}`
            : '评价：不通过',
      );
      writeAudit({
        operator: actor,
        action: 'receipt.submit',
        resource: 'ticket',
        targetId: id,
        after: JSON.stringify({
          pe_grade: input.pe_grade ?? null,
          pc_grade: input.pc_grade ?? null,
          pass: input.pass ?? null,
          target_department: input.target_department,
        }),
        detail: `${hadSubmitted ? '修订回执' : '提交回执'}：${row.circle_name}${hadSubmitted ? `（操作者：${actor.name}）` : ''}`,
      });
    }
    return getTicketDetail(id, { id: actor.id, role: actor.role });
  })();
}

/** 复核：确认即公示，退回则重新进入审核中 */
export function reviewTicket(
  id: string,
  action: 'confirm' | 'reject',
  note: string,
  actor: AuditActor & { id: string },
): TicketSummaryDTO {
  const db = getDb();
  return db.transaction((): TicketSummaryDTO => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
    const receipt = loadReceipt(id);
    if (!receipt || receipt.is_draft) {
      throw ApiError.conflict(BizCode.InvalidTransition, '回执尚未提交，无法复核');
    }
    if (action === 'reject') {
      assertTransition(row.status, 'reviewing');
      db.prepare(`UPDATE ticket SET status = 'reviewing', resulted_at = NULL, updated_at = ? WHERE id = ?`).run(nowIso(), id);
      db.prepare('UPDATE receipt SET is_draft = 1 WHERE ticket_id = ?').run(id);
      addEvent(id, 'receipt_rejected', actor, note || '复核未通过，退回重填');
      writeAudit({
        operator: actor,
        action: 'ticket.review',
        resource: 'ticket',
        targetId: id,
        detail: `复核退回：${note || '无说明'}`,
      });
    } else {
      publishLocked(id, row, actor);
    }
    return toSummary(getJoinedRow(id)!);
  })();
}

/** 发布公示（独立入口，与复核确认等效，均为已出结果 → 已公示） */
export function publishTicket(id: string, actor: AuditActor & { id: string }): TicketSummaryDTO {
  const db = getDb();
  return db.transaction((): TicketSummaryDTO => {
    const row = getJoinedRow(id);
    if (!row) throw ApiError.notFound(BizCode.TicketNotFound, '工单不存在');
    const receipt = loadReceipt(id);
    if (!receipt || receipt.is_draft) {
      throw ApiError.conflict(BizCode.InvalidTransition, '回执尚未提交，无法公示');
    }
    publishLocked(id, row, actor);
    return toSummary(getJoinedRow(id)!);
  })();
}

function publishLocked(id: string, row: JoinedRow, actor: AuditActor): void {
  assertTransition(row.status, 'published');
  const now = nowIso();
  getDb()
    .prepare(`UPDATE ticket SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?`)
    .run(now, now, id);
  addEvent(id, 'review_confirmed', actor, '复核通过');
  addEvent(id, 'published', actor);
  writeAudit({
    operator: actor,
    action: 'ticket.publish',
    resource: 'ticket',
    targetId: id,
    detail: `公示结果：${row.circle_name}`,
  });
}

// ---------------------------------------------------------------------------
// 公示页与统计
// ---------------------------------------------------------------------------

export function listPublished(filters: {
  department_id?: string;
  keyword?: string;
  page: number;
  pageSize: number;
}): Page<PublicityItemDTO> {
  const db = getDb();
  const where = ["t.status = 'published'"];
  const params: unknown[] = [];
  if (filters.department_id) {
    where.push('t.department_id = ?');
    params.push(filters.department_id);
  }
  if (filters.keyword) {
    where.push('(d.name LIKE ? OR m.name LIKE ? OR m.group_name LIKE ?)');
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`, `%${filters.keyword}%`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM ticket t JOIN department d ON d.id = t.department_id JOIN mode m ON m.id = t.mode_id ${whereSql}`,
      )
      .get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT t.id, t.circle_name, t.module, t.published_at, d.name AS department_name,
              m.name AS mode_name, m.group_name AS mode_group,
              r.pe_grade, r.pc_grade, r.pass, r.target_department, r.comment,
              u.name AS auditor_name
       FROM ticket t
       JOIN department d ON d.id = t.department_id
       JOIN mode m ON m.id = t.mode_id
       JOIN receipt r ON r.ticket_id = t.id AND r.is_draft = 0
       LEFT JOIN "user" u ON u.id = r.auditor_id
       ${whereSql}
       ORDER BY t.published_at DESC, t.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as Array<{
    id: string;
    circle_name: string;
    module: DeviceModule;
    published_at: string;
    department_name: string;
    mode_name: string;
    mode_group: string;
    pe_grade: Grade | null;
    pc_grade: Grade | null;
    pass: 0 | 1;
    target_department: string;
    comment: string;
    auditor_name: string | null;
  }>;
  return {
    items: rows.map((r) => ({
      id: r.id,
      department_name: r.department_name,
      mode_name: r.mode_name,
      mode_group: r.mode_group,
      module: r.module,
      circle_name_masked: desensitizeName(r.circle_name),
      pe_grade: r.pe_grade,
      pc_grade: r.pc_grade,
      pass: r.pass === 1,
      target_department: r.target_department,
      comment: r.comment,
      auditor_name: r.auditor_name ?? '—',
      published_at: r.published_at,
    })),
    page: filters.page,
    page_size: filters.pageSize,
    total,
  };
}

export function getStats(): StatsDTO {
  const db = getDb();
  const statusCounts: Record<string, number> = {};
  for (const row of db.prepare('SELECT status, COUNT(*) AS c FROM ticket GROUP BY status').all() as Array<{ status: string; c: number }>) {
    statusCounts[row.status] = row.c;
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayNew = (
    db.prepare('SELECT COUNT(*) AS c FROM ticket WHERE created_at >= ?').get(todayStart.toISOString()) as { c: number }
  ).c;
  const resultedRows = db
    .prepare('SELECT created_at, resulted_at FROM ticket WHERE resulted_at IS NOT NULL ORDER BY resulted_at DESC LIMIT 200')
    .all() as Array<{ created_at: string; resulted_at: string }>;
  const avg =
    resultedRows.length > 0
      ? Math.round(
          (resultedRows.reduce((sum, r) => sum + hoursBetween(r.created_at, r.resulted_at), 0) / resultedRows.length) * 10,
        ) / 10
      : null;
  const perDepartment = db
    .prepare(
      `SELECT t.department_id, d.name AS department_name, COUNT(*) AS count
       FROM ticket t JOIN department d ON d.id = t.department_id GROUP BY t.department_id, d.name ORDER BY count DESC`,
    )
    .all() as Array<{ department_id: string; department_name: string; count: number }>;
  const activeReviewers = (
    db
      .prepare(`SELECT COUNT(DISTINCT assignee_id) AS c FROM ticket WHERE status IN ('reviewing','supplementing')`)
      .get() as { c: number }
  ).c;
  return {
    status_counts: statusCounts,
    today_new: todayNew,
    avg_review_hours: avg,
    total_published: statusCounts['published'] ?? 0,
    active_reviewers: activeReviewers,
    per_department: perDepartment,
    recent_published: listPublished({ page: 1, pageSize: 5 }).items,
  };
}
