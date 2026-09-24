import type { ContactKeyDTO, Page } from '@sr/shared';
import { getDb } from '../db/index.js';
import { genContactCode, newId, nowIso } from '../lib/ids.js';
import { writeAudit, type AuditActor } from './audit.js';

interface ContactKeyRow {
  id: string;
  code: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  status: 'unused' | 'used';
  used_ticket_id: string | null;
  used_at: string | null;
  bind_openid: string | null;
  bound_at: string | null;
  guild_id: string;
}

/** 机器人签发的接洽码没有人工签发人，展示为「QQ 机器人」 */
export const ROBOT_ISSUER_NAME = 'QQ 机器人';

function toDTO(row: ContactKeyRow): ContactKeyDTO {
  return {
    id: row.id,
    code: row.code,
    created_by: row.created_by,
    created_by_name: row.created_by_name ?? (row.created_by ? '' : ROBOT_ISSUER_NAME),
    created_at: row.created_at,
    status: row.status,
    used_ticket_id: row.used_ticket_id,
    used_at: row.used_at,
    bind_openid: row.bind_openid,
    bound_at: row.bound_at,
  };
}

/** 生成唯一接洽码（碰撞时重试） */
function uniqueCode(): string {
  const db = getDb();
  let code = genContactCode();
  for (let i = 0; i < 5; i += 1) {
    const clash = db.prepare('SELECT id FROM contact_key WHERE code = ?').get(code);
    if (!clash) break;
    code = genContactCode();
  }
  return code;
}

/** 生成一个一次性接洽码（记在当前操作者名下，线下 QQ 交付申请人） */
export function generateContactKey(actor: AuditActor & { id: string }): ContactKeyDTO {
  const db = getDb();
  const id = newId('ckey');
  const code = uniqueCode();
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
    bind_openid: null,
    bound_at: null,
  };
}

/**
 * 机器人应玩家 @请求 签发接洽码，并把 openid 绑定到该码。
 * 同一个 openid 会复用其未使用的旧码，避免刷码占表。
 */
export function issueContactKeyForOpenid(openid: string, guildId: string): ContactKeyDTO {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT k.*, NULL AS created_by_name FROM contact_key k
       WHERE k.bind_openid = ? AND k.status = 'unused'
       ORDER BY k.created_at DESC LIMIT 1`,
    )
    .get(openid) as ContactKeyRow | undefined;
  if (existing) {
    // 复用时同步群标识：玩家可能换了群再要码，结果推送要落到最近一次取码的群
    if (guildId && existing.guild_id !== guildId) {
      db.prepare('UPDATE contact_key SET guild_id = ? WHERE id = ?').run(guildId, existing.id);
    }
    return toDTO(existing);
  }

  const id = newId('ckey');
  const code = uniqueCode();
  const now = nowIso();
  db.prepare(
    `INSERT INTO contact_key (id, code, created_by, created_at, status, bind_openid, bound_at, guild_id)
     VALUES (?, ?, NULL, ?, 'unused', ?, ?, ?)`,
  ).run(id, code, now, openid, now, guildId);
  writeAudit({
    operator: null,
    action: 'contact_key.issue_by_robot',
    resource: 'contact_key',
    targetId: id,
    after: JSON.stringify({ guild_id: guildId }),
    detail: 'QQ 机器人签发接洽码并绑定 openid',
  });
  return {
    id,
    code,
    created_by: null,
    created_by_name: ROBOT_ISSUER_NAME,
    created_at: now,
    status: 'unused',
    used_ticket_id: null,
    used_at: null,
    bind_openid: openid,
    bound_at: now,
  };
}

/** 提单时校验：接洽码是否已绑定 openid（机器人接管入口后强制） */
export function isContactKeyBound(code: string): boolean {
  const row = getDb()
    .prepare('SELECT bind_openid FROM contact_key WHERE code = ?')
    .get(code) as { bind_openid: string | null } | undefined;
  return Boolean(row?.bind_openid);
}

/** 工单公示后取出申请人 openid、接洽码与所在群，用于结果推送 */
export function findApplicantBinding(
  ticketId: string,
): { openid: string; code: string; guild_id: string } | null {
  const row = getDb()
    .prepare('SELECT bind_openid, code, guild_id FROM contact_key WHERE used_ticket_id = ? LIMIT 1')
    .get(ticketId) as { bind_openid: string | null; code: string; guild_id: string } | undefined;
  if (!row?.bind_openid) return null;
  return { openid: row.bind_openid, code: row.code, guild_id: row.guild_id };
}

/** 我生成的接洽码列表（最新的在前） */
export function listMyContactKeys(userId: string): ContactKeyDTO[] {
  const rows = getDb()
    .prepare(
      `SELECT k.*, u.name AS created_by_name
       FROM contact_key k LEFT JOIN "user" u ON u.id = k.created_by
       WHERE k.created_by = ?
       ORDER BY k.created_at DESC, k.id DESC`,
    )
    .all(userId) as ContactKeyRow[];
  return rows.map(toDTO);
}

/** 全量接洽码（总管/副总管排查机器人绑定异常用） */
export function listAllContactKeys(filters: {
  bound?: 'bound' | 'unbound';
  page: number;
  pageSize: number;
}): Page<ContactKeyDTO> {
  const db = getDb();
  const where: string[] = [];
  if (filters.bound === 'bound') where.push('k.bind_openid IS NOT NULL');
  if (filters.bound === 'unbound') where.push('k.bind_openid IS NULL');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM contact_key k ${whereSql}`).get() as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT k.*, u.name AS created_by_name
       FROM contact_key k LEFT JOIN "user" u ON u.id = k.created_by
       ${whereSql}
       ORDER BY k.created_at DESC, k.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(filters.pageSize, (filters.page - 1) * filters.pageSize) as ContactKeyRow[];
  return { items: rows.map(toDTO), page: filters.page, page_size: filters.pageSize, total };
}