import type { AnnouncementDTO } from '@sr/shared';
import { getDb } from '../db/index.js';
import { ApiError } from '../lib/errors.js';
import { newId, nowIso } from '../lib/ids.js';
import { writeAudit } from './audit.js';

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  pinned: number;
  expires_at: string | null;
  created_by: string;
  created_at: string;
}

function rowToDto(row: AnnouncementRow): AnnouncementDTO {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    pinned: row.pinned === 1,
    expires_at: row.expires_at,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

/** 公示页公告：置顶优先，过滤已过期条目 */
export function listPublicAnnouncements(): AnnouncementDTO[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM announcement
       WHERE expires_at IS NULL OR expires_at > ?
       ORDER BY pinned DESC, created_at DESC`,
    )
    .all(nowIso()) as AnnouncementRow[];
  return rows.map(rowToDto);
}

export function listAllAnnouncements(): AnnouncementDTO[] {
  const rows = getDb()
    .prepare('SELECT * FROM announcement ORDER BY pinned DESC, created_at DESC')
    .all() as AnnouncementRow[];
  return rows.map(rowToDto);
}

export function createAnnouncement(
  input: { title: string; content: string; pinned: boolean; expires_at?: string | null },
  operator: { id: string | null; name: string } | null,
): AnnouncementDTO {
  const id = newId('ann');
  getDb()
    .prepare(
      `INSERT INTO announcement (id, title, content, pinned, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title,
      input.content,
      input.pinned ? 1 : 0,
      input.expires_at ?? null,
      operator?.name ?? '',
      nowIso(),
    );
  writeAudit({
    operator,
    action: 'announcement.create',
    resource: 'announcement',
    targetId: id,
    after: JSON.stringify({ title: input.title, pinned: input.pinned }),
    detail: `发布公告：${input.title}`,
  });
  return listAllAnnouncements().find((a) => a.id === id)!;
}

export function updateAnnouncement(
  id: string,
  patch: { title?: string; content?: string; pinned?: boolean; expires_at?: string | null },
  operator: { id: string | null; name: string } | null,
): AnnouncementDTO {
  const db = getDb();
  const row = db.prepare('SELECT * FROM announcement WHERE id = ?').get(id) as
    | AnnouncementRow
    | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '公告不存在');
  if (patch.title !== undefined) db.prepare('UPDATE announcement SET title = ? WHERE id = ?').run(patch.title, id);
  if (patch.content !== undefined) db.prepare('UPDATE announcement SET content = ? WHERE id = ?').run(patch.content, id);
  if (patch.pinned !== undefined) db.prepare('UPDATE announcement SET pinned = ? WHERE id = ?').run(patch.pinned ? 1 : 0, id);
  if (patch.expires_at !== undefined) db.prepare('UPDATE announcement SET expires_at = ? WHERE id = ?').run(patch.expires_at, id);
  writeAudit({
    operator,
    action: 'announcement.update',
    resource: 'announcement',
    targetId: id,
    before: JSON.stringify({ title: row.title, pinned: row.pinned }),
    after: JSON.stringify({ title: patch.title ?? row.title, pinned: patch.pinned ?? row.pinned === 1 }),
  });
  return listAllAnnouncements().find((a) => a.id === id)!;
}

export function deleteAnnouncement(
  id: string,
  operator: { id: string | null; name: string } | null,
): void {
  const row = getDb().prepare('SELECT * FROM announcement WHERE id = ?').get(id) as
    | AnnouncementRow
    | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '公告不存在');
  getDb().prepare('DELETE FROM announcement WHERE id = ?').run(id);
  writeAudit({
    operator,
    action: 'announcement.delete',
    resource: 'announcement',
    targetId: id,
    before: JSON.stringify({ title: row.title }),
  });
}

/** 规则变更自动生成公告草稿，总管确认后发布（见第五章） */
export function draftRuleChangeAnnouncement(summary: string): void {
  createAnnouncement(
    {
      title: '审核规则更新通知（草稿）',
      content: `${summary}\n\n本公告由规则配置变更自动生成，请总管确认口径后发布或修改。`,
      pinned: false,
    },
    { id: null, name: '系统' },
  );
}
