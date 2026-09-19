import { staffRoleSchema, type StaffUserDTO } from '@sr/shared';
import { getDb } from '../db/index.js';
import { ApiError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { newId, nowIso } from '../lib/ids.js';
import { writeAudit } from './audit.js';

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: string;
  password_hash: string;
  qq: string;
  skills: string;
  status: 'active' | 'disabled';
  created_at: string;
}

function rowToDto(row: UserRow): StaffUserDTO {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: staffRoleSchema.parse(row.role),
    qq: row.qq ?? '',
    skills: row.skills ?? '',
    status: row.status,
    created_at: row.created_at,
  };
}

export function getStaffUserById(id: string): StaffUserDTO | null {
  const row = getDb().prepare('SELECT * FROM "user" WHERE id = ?').get(id) as UserRow | undefined;
  return row ? rowToDto(row) : null;
}

export function getStaffUserByUsername(username: string): StaffUserDTO | null {
  const row = getDb().prepare('SELECT * FROM "user" WHERE username = ?').get(username) as
    | UserRow
    | undefined;
  return row ? rowToDto(row) : null;
}

/** 校验账号口令；连续失败信息保持一致，避免用户名枚举 */
export function verifyLogin(username: string, password: string): StaffUserDTO {
  const db = getDb();
  const row = db.prepare('SELECT * FROM "user" WHERE username = ?').get(username) as
    | UserRow
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw ApiError.unauthorized('用户名或密码错误');
  }
  if (row.status !== 'active') {
    throw ApiError.forbidden('账号已被停用，请联系总管或系统管理员');
  }
  return rowToDto(row);
}

export function listUsers(): StaffUserDTO[] {
  const rows = getDb()
    .prepare('SELECT * FROM "user" ORDER BY created_at ASC, id ASC')
    .all() as UserRow[];
  return rows.map(rowToDto);
}

/** 可被指派接单的审核人员（审核员/副总管/总管，在职） */
export function listAssignableUsers(): StaffUserDTO[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM "user" WHERE status = 'active' AND role IN ('reviewer','deputy','chief') ORDER BY role = 'chief' DESC, role = 'deputy' DESC, name ASC`,
    )
    .all() as UserRow[];
  return rows.map(rowToDto);
}

export function createUser(input: {
  username: string;
  name: string;
  role: StaffUserDTO['role'];
  password: string;
  qq?: string;
  skills?: string;
  operator: { id: string | null; name: string } | null;
}): StaffUserDTO {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM "user" WHERE username = ?').get(input.username);
  if (exists) {
    throw ApiError.conflict('RESOURCE_CONFLICT', '用户名已存在');
  }
  const id = newId('usr');
  db.prepare(
    `INSERT INTO "user" (id, username, name, role, password_hash, qq, skills, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).run(
    id,
    input.username,
    input.name,
    input.role,
    hashPassword(input.password),
    input.qq ?? '',
    input.skills ?? '',
    nowIso(),
  );
  const created = getStaffUserById(id)!;
  writeAudit({
    operator: input.operator,
    action: 'user.create',
    resource: 'user',
    targetId: id,
    after: JSON.stringify({
      username: created.username,
      name: created.name,
      role: created.role,
      qq: created.qq,
      skills: created.skills,
    }),
    detail: `创建账号 ${created.name}（${created.username}）`,
  });
  return created;
}

export function updateUser(
  id: string,
  patch: {
    name?: string;
    role?: StaffUserDTO['role'];
    qq?: string;
    skills?: string;
    status?: 'active' | 'disabled';
  },
  operator: { id: string | null; name: string } | null,
): StaffUserDTO {
  const db = getDb();
  const before = getStaffUserById(id);
  if (!before) throw ApiError.notFound('RESOURCE_NOT_FOUND', '账号不存在');
  if (patch.role !== undefined) {
    db.prepare('UPDATE "user" SET role = ? WHERE id = ?').run(patch.role, id);
  }
  if (patch.name !== undefined) {
    db.prepare('UPDATE "user" SET name = ? WHERE id = ?').run(patch.name, id);
  }
  if (patch.qq !== undefined) {
    db.prepare('UPDATE "user" SET qq = ? WHERE id = ?').run(patch.qq, id);
  }
  if (patch.skills !== undefined) {
    db.prepare('UPDATE "user" SET skills = ? WHERE id = ?').run(patch.skills, id);
  }
  if (patch.status !== undefined) {
    db.prepare('UPDATE "user" SET status = ? WHERE id = ?').run(patch.status, id);
  }
  const after = getStaffUserById(id)!;
  writeAudit({
    operator,
    action: 'user.update',
    resource: 'user',
    targetId: id,
    before: JSON.stringify({
      name: before.name,
      role: before.role,
      qq: before.qq,
      skills: before.skills,
      status: before.status,
    }),
    after: JSON.stringify({
      name: after.name,
      role: after.role,
      qq: after.qq,
      skills: after.skills,
      status: after.status,
    }),
  });
  return after;
}

export function resetPassword(
  id: string,
  password: string,
  operator: { id: string | null; name: string } | null,
): void {
  const db = getDb();
  const before = getStaffUserById(id);
  if (!before) throw ApiError.notFound('RESOURCE_NOT_FOUND', '账号不存在');
  db.prepare('UPDATE "user" SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  writeAudit({
    operator,
    action: 'user.reset_password',
    resource: 'user',
    targetId: id,
    detail: `重置账号口令：${before.name}`,
  });
}
