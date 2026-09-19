import { CATALOG_DEPARTMENTS, CATALOG_MODES, DEPRECATED_DEPT_IDS } from './catalog.js';
import { getDb } from './index.js';
import { writeAudit } from '../services/audit.js';

/**
 * 目录迁移（幂等）：将部门/模式目录对齐到 catalog.ts 口径。
 * 仅改动 department 与 mode 表；账号、工单、回执等业务数据不受影响。
 * 复用旧 id 保证历史工单外键不变，新增部门/模式直接插入，旧目录部门置为停用。
 */
export function syncCatalog(): void {
  const db = getDb();
  db.transaction(() => {
    const deptUpsert = db.prepare(
      `INSERT INTO department (id, name, tier, contact, description, sort, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, tier = excluded.tier, contact = excluded.contact,
         description = excluded.description, sort = excluded.sort, enabled = 1`,
    );
    for (const d of CATALOG_DEPARTMENTS) {
      deptUpsert.run(d.id, d.name, d.tier, d.contact, d.description, d.sort);
    }

    const modeUpsert = db.prepare(
      `INSERT INTO mode (id, department_id, group_name, name, min_requirement, sort)
       VALUES (?, ?, '', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         department_id = excluded.department_id, group_name = '',
         name = excluded.name, min_requirement = excluded.min_requirement, sort = excluded.sort`,
    );
    for (const m of CATALOG_MODES) {
      modeUpsert.run(m.id, m.department_id, m.name, m.min_requirement, m.sort);
    }

    const disable = db.prepare(
      `UPDATE department SET enabled = 0 WHERE id IN (${DEPRECATED_DEPT_IDS.map(() => '?').join(',')})`,
    );
    disable.run(...DEPRECATED_DEPT_IDS);

    writeAudit({
      operator: null,
      action: 'catalog.sync',
      resource: 'catalog',
      targetId: 'department+mode',
      after: JSON.stringify({ departments: CATALOG_DEPARTMENTS.length, modes: CATALOG_MODES.length }),
      detail: '同步审核部门与模式目录（合并审核意向，接洽码流程）',
    });
  })();
  console.log(
    `[sync-catalog] 完成：${CATALOG_DEPARTMENTS.length} 个部门、${CATALOG_MODES.length} 个模式；停用旧部门 ${DEPRECATED_DEPT_IDS.join(' / ')}。账号与工单数据未改动。`,
  );
}
