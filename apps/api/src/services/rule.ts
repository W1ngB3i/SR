import type {
  DepartmentDTO,
  DepartmentModeOverviewDTO,
  DepartmentModeSaveResultDTO,
  ModeDTO,
  RulesBundleDTO,
} from '@sr/shared';
import { DEVICE_NOTES, GRADES } from '@sr/shared';
import { getDb } from '../db/index.js';
import { ApiError } from '../lib/errors.js';
import { newId, nowIso } from '../lib/ids.js';
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

/**
 * 按部门加载「该部门开放的模式」：走 department_mode 关联表，
 * mode.department_id 仅作默认归属，不再决定模式在哪个部门可见。
 */
function loadModes(departmentIds: string[]): Map<string, ModeDTO[]> {
  const map = new Map<string, ModeDTO[]>();
  for (const id of departmentIds) map.set(id, []);
  if (departmentIds.length === 0) return map;
  const placeholders = departmentIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.group_name, m.name, m.min_requirement,
              dm.department_id AS department_id, dm.sort AS sort
       FROM mode m
       JOIN department_mode dm ON dm.mode_id = m.id
       WHERE dm.department_id IN (${placeholders})
       ORDER BY dm.sort ASC, m.name ASC`,
    )
    .all(...departmentIds) as ModeRow[];
  for (const row of rows) {
    map.get(row.department_id)?.push({ ...row });
  }
  return map;
}

/** 部门模式开放配置总览：部门列表 + 模式全集 + 各部门当前开放的 mode_id（后台一次性渲染） */
export function getDepartmentModesOverview(): DepartmentModeOverviewDTO {
  const db = getDb();
  const departments = db
    .prepare('SELECT id, name, tier, sort, enabled FROM department ORDER BY sort ASC, name ASC')
    .all() as { id: string; name: string; tier: string; sort: number; enabled: number }[];
  const modes = db.prepare('SELECT * FROM mode ORDER BY sort ASC, name ASC').all() as ModeRow[];
  const relations = db
    .prepare('SELECT department_id, mode_id FROM department_mode ORDER BY department_id ASC, sort ASC')
    .all() as { department_id: string; mode_id: string }[];
  const openModeIds: Record<string, string[]> = {};
  for (const dept of departments) openModeIds[dept.id] = [];
  for (const rel of relations) (openModeIds[rel.department_id] ??= []).push(rel.mode_id);
  return {
    departments: departments.map((dept) => ({
      id: dept.id,
      name: dept.name,
      tier: dept.tier,
      sort: dept.sort,
      enabled: dept.enabled === 1,
    })),
    modes: modes.map((mode) => ({ ...mode })),
    open_mode_ids: openModeIds,
  };
}

/** 全量覆盖某部门的模式开放关系（幂等、可重放）：先清空再按给定顺序写入 */
export function setDepartmentModes(
  departmentId: string,
  modeIds: string[],
  operator: { id: string | null; name: string } | null,
): DepartmentModeSaveResultDTO {
  const db = getDb();
  const dept = db.prepare('SELECT id, name FROM department WHERE id = ?').get(departmentId) as
    | { id: string; name: string }
    | undefined;
  if (!dept) throw ApiError.notFound('RESOURCE_NOT_FOUND', '部门不存在');

  const unique = [...new Set(modeIds)];
  if (unique.length > 0) {
    const placeholders = unique.map(() => '?').join(',');
    const found = db.prepare(`SELECT id FROM mode WHERE id IN (${placeholders})`).all(...unique) as {
      id: string;
    }[];
    const valid = new Set(found.map((row) => row.id));
    const invalid = unique.filter((id) => !valid.has(id));
    if (invalid.length > 0) {
      throw ApiError.badRequest('INVALID_INPUT', '包含无效的模式 ID', { mode_ids: invalid });
    }
  }

  const before = db
    .prepare('SELECT mode_id FROM department_mode WHERE department_id = ? ORDER BY sort ASC')
    .all(departmentId) as { mode_id: string }[];

  db.transaction(() => {
    db.prepare('DELETE FROM department_mode WHERE department_id = ?').run(departmentId);
    const insert = db.prepare(
      `INSERT INTO department_mode (department_id, mode_id, sort, created_by, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    unique.forEach((modeId, index) => {
      insert.run(departmentId, modeId, index, operator?.name ?? '', nowIso());
    });
  })();

  writeAudit({
    operator,
    action: 'department.modes.update',
    resource: 'department_mode',
    targetId: departmentId,
    before: JSON.stringify(before.map((row) => row.mode_id)),
    after: JSON.stringify(unique),
    detail: `更新部门「${dept.name}」开放模式：${unique.length} 项`,
  });

  return { department_id: departmentId, mode_ids: unique };
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
  input: { department_id?: string; group_name: string; name: string; min_requirement: string; sort: number },
  operator: { id: string | null; name: string } | null,
): ModeDTO {
  const db = getDb();
  // 模式为全局全集，department_id 仅作默认归属；未指定时落到总部
  const departmentId = input.department_id ?? 'dept-hq';
  const dept = db.prepare('SELECT * FROM department WHERE id = ?').get(departmentId) as
    | DepartmentRow
    | undefined;
  if (!dept) throw ApiError.notFound('RESOURCE_NOT_FOUND', '归属部门不存在');
  const id = newId('mode');
  db.transaction(() => {
    db.prepare(
      `INSERT INTO mode (id, department_id, group_name, name, min_requirement, sort)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, departmentId, input.group_name, input.name, input.min_requirement, input.sort);
    // 默认归属部门同步开放，便于在「部门模式管理」直接看到新模式的开放状态
    db.prepare(
      `INSERT OR IGNORE INTO department_mode (department_id, mode_id, sort, created_by, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(departmentId, id, input.sort, operator?.name ?? '', nowIso());
  })();
  writeAudit({
    operator,
    action: 'mode.create',
    resource: 'mode',
    targetId: id,
    after: JSON.stringify({ ...input, department_id: departmentId, department: dept.name }),
    detail: `新增模式：${input.name}（默认归属「${dept.name}」）`,
  });
  draftRuleChangeAnnouncement(`新增审核模式「${input.name}」${input.min_requirement ? `（${input.min_requirement}）` : ''}，默认归属「${dept.name}」。`);
  return {
    id,
    department_id: departmentId,
    group_name: input.group_name,
    name: input.name,
    min_requirement: input.min_requirement,
    sort: input.sort,
  };
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
