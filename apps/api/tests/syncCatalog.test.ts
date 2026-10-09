import { beforeAll, describe, expect, it } from 'vitest';
import { useTempDataDir } from './helpers.js';

useTempDataDir();

let seed: typeof import('../src/db/seed.js');
let sync: typeof import('../src/db/syncCatalog.js');
let rule: typeof import('../src/services/rule.js');
let dbMod: typeof import('../src/db/index.js');

beforeAll(async () => {
  seed = await import('../src/db/seed.js');
  sync = await import('../src/db/syncCatalog.js');
  rule = await import('../src/services/rule.js');
  dbMod = await import('../src/db/index.js');
  seed.seedDatabase(true);
});

describe('目录同步：4 部门 + 总部 28 模式', () => {
  it('seed 后共 4 个部门，总部 28 个模式，其余部门模式留空', () => {
    const departments = rule.listDepartments(false);
    expect(departments.map((d) => d.name)).toEqual(['总部', 'Party', 'Team', 'Group']);
    const hq = departments.find((d) => d.id === 'dept-hq')!;
    expect(hq.tier).toBe('B+ Tier');
    expect(hq.modes).toHaveLength(28);
    expect(hq.modes.every((m) => m.min_requirement === 'B+ Tier 及政审')).toBe(true);
    for (const dept of departments.filter((d) => d.id !== 'dept-hq')) {
      expect(dept.modes, `${dept.name} 不应配置模式`).toHaveLength(0);
    }
  });
});

describe('目录同步：旧目录历史引用迁移', () => {
  it('旧部门 / 旧模式引用迁移至总部，无对应模式的旧记录保持原样', () => {
    const db = dbMod.getDb();
    // 模拟上一版目录：EC（单刀）与 Java低版本（Classic，新目录已无对应条目）
    db.prepare(
      `INSERT INTO department (id, name, tier, contact, description, sort, enabled)
       VALUES ('dept-ec-intl', 'EC', 'C+ Tier', '', '', 9, 1),
              ('dept-javalow', 'Java低版本', '', '', '', 10, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO mode (id, department_id, group_name, name, min_requirement, sort)
       VALUES ('mode-ec-dandao', 'dept-ec-intl', '', '单刀', '', 1),
              ('mode-javalow-classic', 'dept-javalow', '', 'Classic', '', 5)`,
    ).run();
    const insertTicket = db.prepare(
      `INSERT INTO ticket (id, query_code, circle_name, intention, department_id, module, mode_id,
                           self_proof, contact, status, assignee_id, is_priority, supplement_reason,
                           created_at, updated_at)
       VALUES (?, ?, ?, '', ?, 'PE', ?, 0, 'AAAAAA', 'pending_claim', NULL, 0, '', ?, ?)`,
    );
    insertTicket.run(
      'tkt-legacy-ec', 'LEGACY01', '旧数据圈', 'dept-ec-intl', 'mode-ec-dandao',
      '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
    );
    insertTicket.run(
      'tkt-legacy-classic', 'LEGACY02', '旧数据圈二', 'dept-javalow', 'mode-javalow-classic',
      '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
    );
    db.prepare(`UPDATE "user" SET department_id = 'dept-ec-intl' WHERE id = 'usr-xingchen'`).run();
    db.prepare(
      `INSERT INTO robot_identities (openid, qq_number, role, dept_id, user_id, guild_id, source, created_at)
       VALUES ('openid-legacy', '', 'reviewer', 'dept-ec-intl', 'usr-xingchen', 'guild-legacy', 'bot', ?)`,
    ).run('2026-09-01T00:00:00.000Z');
    // 旧口径难度公告：标题一致时，内容应被同步为新口径文本
    db.prepare(
      `INSERT INTO announcement (id, title, content, pinned, expires_at, created_by, created_at)
       VALUES ('ann-legacy', ?, '旧口径：总部 B+ Tier（单公会）；SR_Arrow 生存部门 B-。', 1, NULL, '望北', ?)`,
    ).run(seed.DIFFICULTY_ANNOUNCEMENT_TITLE, '2026-09-01T00:00:00.000Z');

    sync.syncCatalog();

    const ticketOf = (id: string) =>
      db.prepare('SELECT department_id, mode_id FROM ticket WHERE id = ?').get(id) as {
        department_id: string;
        mode_id: string;
      };
    expect(ticketOf('tkt-legacy-ec')).toEqual({ department_id: 'dept-hq', mode_id: 'mode-hq-01' });
    expect(ticketOf('tkt-legacy-classic')).toEqual({
      department_id: 'dept-hq',
      mode_id: 'mode-javalow-classic',
    });
    expect(
      (db.prepare(`SELECT department_id FROM "user" WHERE id = 'usr-xingchen'`).get() as {
        department_id: string;
      }).department_id,
    ).toBe('dept-hq');
    expect(
      (db.prepare(`SELECT dept_id FROM robot_identities WHERE openid = 'openid-legacy'`).get() as {
        dept_id: string;
      }).dept_id,
    ).toBe('dept-hq');
    expect(
      (db.prepare(`SELECT enabled FROM department WHERE id = 'dept-ec-intl'`).get() as {
        enabled: number;
      }).enabled,
    ).toBe(0);
    expect(
      (db.prepare('SELECT content FROM announcement WHERE id = ?').get('ann-legacy') as {
        content: string;
      }).content,
    ).toBe(seed.DIFFICULTY_ANNOUNCEMENT_CONTENT);
  });

  it('重复执行保持幂等：目录与迁移结果不再变化', () => {
    const db = dbMod.getDb();
    sync.syncCatalog();
    expect(
      (db.prepare('SELECT mode_id FROM ticket WHERE id = ?').get('tkt-legacy-ec') as {
        mode_id: string;
      }).mode_id,
    ).toBe('mode-hq-01');
    expect(rule.listDepartments(false)).toHaveLength(4);
  });
});