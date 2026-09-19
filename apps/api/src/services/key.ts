import type { ContactKeyDTO } from '@sr/shared';
import { getDb } from '../db/index.js';
import { genContactCode, newId, nowIso } from '../lib/ids.js';
import { writeAudit, type AuditActor } from './audit.js';

interface ContactKeyRow {
  id: string;
  code: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  status: 'unused' | 'used';
  used_ticket_id: string | null;
  used_at: string | null;
}

function toDTO(row: ContactKeyRow): ContactKeyDTO {
  return {
    id: row.id,
    code: row.code,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    status: row.status,
    used_ticket_id: row.used_ticket_id,
    used_at: row.used_at,
  };
}

/** 生成一个一次性接洽码（记在当前操作者名下，线下 QQ 交付申请人） */
export function generateContactKey(actor: AuditActor & { id: string }): ContactKeyDTO {
  const db = getDb();
  const id = newId('ckey');
  let code = genContactCode();
  for (let i = 0; i < 5; i++) {
    const clash = db.prepare('SELECT id FROM contact_key WHERE code = ?').get(code);
    if (!clash) break;
    code = genContactCode();
  }
  const now = nowIso();
  db.prepare(
    `INSERT INTO contact_key (id, code, created_by, created_at, status) VALUES (?, ?, ?, ?, 'unused')`,
  ).run(id, code, actor.id, now);
  writeAudit({
    operator: actor,
    action: 'contact_key.create',
    resource: 'contact_key',
    targetId: id,
    after: JSON.stringify({ code }),
    detail: '生成一次性接洽码',
  });
  return {
    id,
    code,
    created_by: actor.id,
    created_by_name: actor.name,
    created_at: now,
    status: 'unused',
    used_ticket_id: null,
    used_at: null,
  };
}

/** 我生成的接洽码列表（最新的在前） */
export function listMyContactKeys(userId: string): ContactKeyDTO[] {
  const rows = getDb()
    .prepare(
      `SELECT k.*, u.name AS created_by_name
       FROM contact_key k JOIN "user" u ON u.id = k.created_by
       WHERE k.created_by = ?
       ORDER BY k.created_at DESC, k.id DESC`,
    )
    .all(userId) as ContactKeyRow[];
  return rows.map(toDTO);
}
