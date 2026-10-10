import {
  CATALOG_DEPARTMENT_MODES,
  CATALOG_DEPARTMENTS,
  CATALOG_MODES,
  DEPRECATED_DEPT_IDS,
  DEPRECATED_MODE_MAP,
} from './catalog.js';
import { DIFFICULTY_ANNOUNCEMENT_CONTENT, DIFFICULTY_ANNOUNCEMENT_TITLE } from './seed.js';
import { getDb } from './index.js';
import { writeAudit } from '../services/audit.js';

/**
 * 目录迁移（幂等）：将部门/模式目录对齐到 catalog.ts 口径，并改写历史引用。
 *  1. department / mode：Upsert 最新目录；旧部门置为停用（保留数据行，承载历史外键）；
 *  2. ticket：旧部门 id 统一改挂总部，旧模式 id 按 DEPRECATED_MODE_MAP 映射
 *     —— 未映射的旧模式保留原记录，避免历史工单悬空；
 *  3. user.department_id / robot_identities.dept_id：同步改挂总部，
 *     否则全部模式的工单都落在总部后，原各部门审核员将匹配不到接单通知；
 *  4. 难度标准公告：标题匹配时把内容同步为新口径文本（改过标题的自定义公告不动）。
 */
export function syncCatalog(): void {
  const db = getDb();
  const migrated = db.transaction(() => {
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

    // 开放关系只补初始缺省（总部 28 条），已存在的记录不动：
    // 后台调整过开放范围后重跑本命令不会覆盖人工配置。
    const deptModeInsert = db.prepare(
      `INSERT OR IGNORE INTO department_mode (department_id, mode_id, sort, created_by, created_at)
       VALUES (?, ?, ?, 'catalog.sync', ?)`,
    );
    let relations = 0;
    const syncAt = new Date().toISOString();
    for (const dm of CATALOG_DEPARTMENT_MODES) {
      relations += deptModeInsert.run(dm.department_id, dm.mode_id, dm.sort, syncAt).changes;
    }

    const placeholders = DEPRECATED_DEPT_IDS.map(() => '?').join(',');
    const ticketsByDept = db
      .prepare(`UPDATE ticket SET department_id = 'dept-hq' WHERE department_id IN (${placeholders})`)
      .run(...DEPRECATED_DEPT_IDS).changes;
    let ticketsByMode = 0;
    const modeUpdate = db.prepare('UPDATE ticket SET mode_id = ? WHERE mode_id = ?');
    for (const [oldId, newId] of Object.entries(DEPRECATED_MODE_MAP)) {
      ticketsByMode += modeUpdate.run(newId, oldId).changes;
    }
    const users = db
      .prepare(`UPDATE "user" SET department_id = 'dept-hq' WHERE department_id IN (${placeholders})`)
      .run(...DEPRECATED_DEPT_IDS).changes;
    const identities = db
      .prepare(`UPDATE robot_identities SET dept_id = 'dept-hq' WHERE dept_id IN (${placeholders})`)
      .run(...DEPRECATED_DEPT_IDS).changes;
    const announcement = db
      .prepare('UPDATE announcement SET content = ? WHERE title = ? AND content <> ?')
      .run(DIFFICULTY_ANNOUNCEMENT_CONTENT, DIFFICULTY_ANNOUNCEMENT_TITLE, DIFFICULTY_ANNOUNCEMENT_CONTENT)
      .changes;

    db.prepare(`UPDATE department SET enabled = 0 WHERE id IN (${placeholders})`).run(
      ...DEPRECATED_DEPT_IDS,
    );

    writeAudit({
      operator: null,
      action: 'catalog.sync',
      resource: 'catalog',
      targetId: 'department+mode',
      after: JSON.stringify({
        departments: CATALOG_DEPARTMENTS.length,
        modes: CATALOG_MODES.length,
        department_modes_added: relations,
        migrated: {
          tickets_by_department: ticketsByDept,
          tickets_by_mode: ticketsByMode,
          users,
          robot_identities: identities,
          difficulty_announcement: announcement,
        },
      }),
      detail: '同步审核部门与模式目录，并将历史工单 / 账号 / 机器人绑定迁移至总部',
    });

    return { ticketsByDept, ticketsByMode, users, identities, announcement, relations };
  })();

  console.log(
    `[sync-catalog] 完成：${CATALOG_DEPARTMENTS.length} 个部门、${CATALOG_MODES.length} 个模式；` +
      `补齐部门开放关系 ${migrated.relations} 条；` +
      `迁移历史引用 工单 ${migrated.ticketsByDept + migrated.ticketsByMode} 处（部门 ${migrated.ticketsByDept} / 模式 ${migrated.ticketsByMode}）、` +
      `账号 ${migrated.users} 个、机器人绑定 ${migrated.identities} 条；` +
      `停用旧部门 ${DEPRECATED_DEPT_IDS.length} 个${migrated.announcement > 0 ? '；难度公告已更新为新口径' : ''}。`,
  );
}