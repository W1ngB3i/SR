import type { DepartmentDTO, ModeDTO, RulesBundleDTO } from '@sr/shared';
import { DEVICE_NOTES, GRADES } from '@sr/shared';
import { getDb } from '../db/index.js';
import { ApiError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { writeAudit } from './audit.js';
import { draftRuleChangeAnnouncement } from './announcement.js';
import { getConfig } from './config.js';

interface DepartmentRow {
  id: string;
  name: string;
  tier: string;
  contact: string;
  description: string;
  sort: number;
  enabled: number;
}

interface ModeRow {
  id: string;
  department_id: string;
  group_name: string;
  name: string;
  min_requirement: string;
  sort: number;
}

function loadModes(departmentIds: string[]): Map<string, ModeDTO[]> {
  const map = new Map<string, ModeDTO[]>();
  for (const id of departmentIds) map.set(id, []);
  if (departmentIds.length === 0) return map;
  const placeholders = departmentIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT * FROM mode WHERE department_id IN (${placeholders}) ORDER BY sort ASC, name ASC`)
    .all(...departmentIds) as ModeRow[];
  for (const row of rows) {
    map.get(row.department_id)!.push({ ...row });
  }
  return map;
}

export function listDepartments(includeDisabled: boolean): DepartmentDTO[] {
  const db = getDb();
  const rows = (
    includeDisabled
      ? db.prepare('SELECT * FROM department ORDER BY sort ASC, name ASC')
      : db.prepare('SELECT * FROM department WHERE enabled = 1 ORDER BY sort ASC, name ASC')
  ).all() as DepartmentRow[];
  const ids = rows.map((r) => r.id);
  const modes = loadModes(ids);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    tier: row.tier,
    contact: row.contact,
    description: row.description,
    sort: row.sort,
    enabled: row.enabled === 1,
    modes: modes.get(row.id) ?? [],
  }));
}

/** 规则配置中心的对外只读快照：驱动申请表单与规则页 */
export function getRulesBundle(): RulesBundleDTO {
  return {
    departments: listDepartments(false),
    feedback_contacts: getConfig('feedback_contacts'),
    device_notes: [...DEVICE_NOTES],
    grade_ladder: [...GRADES],
  };
}

export function createDepartment(
  input: { name: string; tier: string; contact: string; description: string; sort: number; enabled: boolean },
  operator: { id: string | null; name: string } | null,
): DepartmentDTO {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM department WHERE name = ?').get(input.name);
  if (exists) throw ApiError.conflict('RESOURCE_CONFLICT', '同名部门已存在');
  const id = newId('dept');
  db.prepare(
    `INSERT INTO department (id, name, tier, contact, description, sort, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.tier, input.contact, input.description, input.sort, input.enabled ? 1 : 0);
  writeAudit({
    operator,
    action: 'department.create',
    resource: 'department',
    targetId: id,
    after: JSON.stringify(input),
    detail: `新增部门：${input.name}`,
  });
  draftRuleChangeAnnouncement(`新增部门「${input.name}」${input.tier ? `（难度 ${input.tier}）` : ''}。`);
  return listDepartments(true).find((d) => d.id === id)!;
}

export function updateDepartment(
  id: string,
  patch: { name?: string; tier?: string; contact?: string; description?: string; sort?: number; enabled?: boolean },
  operator: { id: string | null; name: string } | null,
): DepartmentDTO {
  const db = getDb();
  const row = db.prepare('SELECT * FROM department WHERE id = ?').get(id) as DepartmentRow | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '部门不存在');
  const before = { name: row.name, tier: row.tier, contact: row.contact, description: row.description, sort: row.sort, enabled: row.enabled === 1 };
  if (patch.name !== undefined) db.prepare('UPDATE department SET name = ? WHERE id = ?').run(patch.name, id);
  if (patch.tier !== undefined) db.prepare('UPDATE department SET tier = ? WHERE id = ?').run(patch.tier, id);
  if (patch.contact !== undefined) db.prepare('UPDATE department SET contact = ? WHERE id = ?').run(patch.contact, id);
  if (patch.description !== undefined) db.prepare('UPDATE department SET description = ? WHERE id = ?').run(patch.description, id);
  if (patch.sort !== undefined) db.prepare('UPDATE department SET sort = ? WHERE id = ?').run(patch.sort, id);
  if (patch.enabled !== undefined) db.prepare('UPDATE department SET enabled = ? WHERE id = ?').run(patch.enabled ? 1 : 0, id);
  writeAudit({
    operator,
    action: 'department.update',
    resource: 'department',
    targetId: id,
    before: JSON.stringify(before),
    after: JSON.stringify({ ...before, ...patch }),
  });
  if (patch.name !== undefined && patch.name !== before.name) {
    draftRuleChangeAnnouncement(`部门「${before.name}」更名为「${patch.name}」。`);
  }
  if (patch.tier !== undefined && patch.tier !== before.tier) {
    draftRuleChangeAnnouncement(`部门「${patch.name ?? before.name}」难度调整为 ${patch.tier || '未标注'}。`);
  }
  return listDepartments(true).find((d) => d.id === id)!;
}

export function deleteDepartment(id: string, operator: { id: string | null; name: string } | null): void {
  const db = getDb();
  const row = db.prepare('SELECT * FROM department WHERE id = ?').get(id) as DepartmentRow | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '部门不存在');
  const modeCount = (db.prepare('SELECT COUNT(*) AS c FROM mode WHERE department_id = ?').get(id) as { c: number }).c;
  if (modeCount > 0) {
    throw ApiError.conflict('RESOURCE_CONFLICT', `该部门下仍有 ${modeCount} 个审核模式，请先移除或转移`);
  }
  db.prepare('DELETE FROM department WHERE id = ?').run(id);
  writeAudit({
    operator,
    action: 'department.delete',
    resource: 'department',
    targetId: id,
    before: JSON.stringify({ name: row.name }),
    detail: `删除部门：${row.name}`,
  });
  draftRuleChangeAnnouncement(`移除部门「${row.name}」。`);
}

export function createMode(
  input: { department_id: string; group_name: string; name: string; min_requirement: string; sort: number },
  operator: { id: string | null; name: string } | null,
): ModeDTO {
  const db = getDb();
  const dept = db.prepare('SELECT * FROM department WHERE id = ?').get(input.department_id) as
    | DepartmentRow
    | undefined;
  if (!dept) throw ApiError.notFound('RESOURCE_NOT_FOUND', '所属部门不存在');
  const id = newId('mode');
  db.prepare(
    `INSERT INTO mode (id, department_id, group_name, name, min_requirement, sort)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.department_id, input.group_name, input.name, input.min_requirement, input.sort);
  writeAudit({
    operator,
    action: 'mode.create',
    resource: 'mode',
    targetId: id,
    after: JSON.stringify({ ...input, department: dept.name }),
    detail: `部门「${dept.name}」新增模式：${input.name}`,
  });
  draftRuleChangeAnnouncement(`「${dept.name}」新增审核模式「${input.name}」${input.min_requirement ? `（${input.min_requirement}）` : ''}。`);
  return { id, ...input };
}

export function updateMode(
  id: string,
  patch: { group_name?: string; name?: string; min_requirement?: string; sort?: number },
  operator: { id: string | null; name: string } | null,
): ModeDTO {
  const db = getDb();
  const row = db.prepare('SELECT * FROM mode WHERE id = ?').get(id) as ModeRow | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '模式不存在');
  if (patch.group_name !== undefined) db.prepare('UPDATE mode SET group_name = ? WHERE id = ?').run(patch.group_name, id);
  if (patch.name !== undefined) db.prepare('UPDATE mode SET name = ? WHERE id = ?').run(patch.name, id);
  if (patch.min_requirement !== undefined) db.prepare('UPDATE mode SET min_requirement = ? WHERE id = ?').run(patch.min_requirement, id);
  if (patch.sort !== undefined) db.prepare('UPDATE mode SET sort = ? WHERE id = ?').run(patch.sort, id);
  writeAudit({
    operator,
    action: 'mode.update',
    resource: 'mode',
    targetId: id,
    before: JSON.stringify({ name: row.name, min_requirement: row.min_requirement }),
    after: JSON.stringify({ name: patch.name ?? row.name, min_requirement: patch.min_requirement ?? row.min_requirement }),
  });
  if (patch.name !== undefined && patch.name !== row.name) {
    draftRuleChangeAnnouncement(`审核模式「${row.name}」更名为「${patch.name}」。`);
  }
  const updated = db.prepare('SELECT * FROM mode WHERE id = ?').get(id) as ModeRow;
  return { ...updated };
}

export function deleteMode(id: string, operator: { id: string | null; name: string } | null): void {
  const db = getDb();
  const row = db.prepare('SELECT * FROM mode WHERE id = ?').get(id) as ModeRow | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '模式不存在');
  db.prepare('DELETE FROM mode WHERE id = ?').run(id);
  writeAudit({
    operator,
    action: 'mode.delete',
    resource: 'mode',
    targetId: id,
    before: JSON.stringify({ name: row.name }),
    detail: `删除模式：${row.name}`,
  });
  draftRuleChangeAnnouncement(`移除审核模式「${row.name}」。`);
}
