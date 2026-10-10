import { beforeAll, describe, expect, it } from 'vitest';
import { useTempDataDir } from './helpers.js';

useTempDataDir();

let seed: typeof import('../src/db/seed.js');
let rule: typeof import('../src/services/rule.js');
let dbMod: typeof import('../src/db/index.js');
let auth: typeof import('../src/middleware/auth.js');

beforeAll(async () => {
  seed = await import('../src/db/seed.js');
  rule = await import('../src/services/rule.js');
  dbMod = await import('../src/db/index.js');
  auth = await import('../src/middleware/auth.js');
  seed.seedDatabase(true);
});

const wangbei = { id: 'usr-wangbei', name: '望北' };

describe('部门模式开放配置：总览', () => {
  it('overview 返回 4 部门、28 模式全集与总部开放关系，其余部门为空', () => {
    const overview = rule.getDepartmentModesOverview();
    expect(overview.departments).toHaveLength(4);
    expect(overview.modes).toHaveLength(28);
    expect(overview.open_mode_ids['dept-hq']).toHaveLength(28);
    for (const dept of overview.departments.filter((d) => d.id !== 'dept-hq')) {
      expect(overview.open_mode_ids[dept.id], `${dept.name} 不应开放模式`).toHaveLength(0);
    }
  });
});

describe('部门模式开放配置：全量覆盖保存', () => {
  it('保存后申请页联动：开启 Party 模式', () => {
    rule.setDepartmentModes('dept-party', ['mode-hq-01', 'mode-hq-02'], wangbei);
    const party = rule.listDepartments(false).find((d) => d.id === 'dept-party')!;
    expect(party.modes.map((m) => m.id)).toEqual(['mode-hq-01', 'mode-hq-02']);
  });

  it('重复提交同一列表幂等且自动去重', () => {
    const first = rule.setDepartmentModes(
      'dept-team',
      ['mode-hq-05', 'mode-hq-05', 'mode-hq-03'],
      wangbei,
    );
    expect(first.mode_ids).toEqual(['mode-hq-05', 'mode-hq-03']);
    const second = rule.setDepartmentModes('dept-team', ['mode-hq-05', 'mode-hq-03'], wangbei);
    expect(second.mode_ids).toEqual(first.mode_ids);
    const count = (
      dbMod.getDb().prepare('SELECT COUNT(*) AS c FROM department_mode WHERE department_id = ?').get(
        'dept-team',
      ) as { c: number }
    ).c;
    expect(count).toBe(2);
  });

  it('清空列表等于关闭该部门全部模式', () => {
    rule.setDepartmentModes('dept-party', [], wangbei);
    const party = rule.listDepartments(false).find((d) => d.id === 'dept-party')!;
    expect(party.modes).toHaveLength(0);
  });

  it('包含非法 mode_id 时拒绝且不落库', () => {
    expect(() =>
      rule.setDepartmentModes('dept-group', ['mode-hq-01', 'mode-does-not-exist'], wangbei),
    ).toThrowError(/无效/);
    const count = (
      dbMod.getDb().prepare('SELECT COUNT(*) AS c FROM department_mode WHERE department_id = ?').get(
        'dept-group',
      ) as { c: number }
    ).c;
    expect(count).toBe(0);
  });

  it('部门不存在时抛 404', () => {
    expect(() => rule.setDepartmentModes('dept-nope', ['mode-hq-01'], wangbei)).toThrowError(
      /不存在/,
    );
  });

  it('关闭总部模式后规则查询同步收敛', () => {
    rule.setDepartmentModes('dept-hq', ['mode-hq-01', 'mode-hq-02'], wangbei);
    const hq = rule.listDepartments(false).find((d) => d.id === 'dept-hq')!;
    expect(hq.modes.map((m) => m.id)).toEqual(['mode-hq-01', 'mode-hq-02']);
    // 恢复总部全量开放，避免影响后续断言
    rule.setDepartmentModes(
      'dept-hq',
      Array.from({ length: 28 }, (_, i) => `mode-hq-${String(i + 1).padStart(2, '0')}`),
      wangbei,
    );
    expect(rule.listDepartments(false).find((d) => d.id === 'dept-hq')!.modes).toHaveLength(28);
  });
});

describe('部门模式开放配置：新建模式默认归属即开放', () => {
  it('createMode 指定归属部门后该部门自动开放该模式', () => {
    const mode = rule.createMode(
      { department_id: 'dept-team', group_name: '', name: '小队模式A', min_requirement: 'C+ Tier', sort: 99 },
      wangbei,
    );
    const team = rule.listDepartments(false).find((d) => d.id === 'dept-team')!;
    expect(team.modes.map((m) => m.id)).toContain(mode.id);
  });
});

describe('部门模式开放配置：角色组', () => {
  it('chief / deputy / admin 可管理，reviewer 被排除', () => {
    expect(auth.DEPT_MODE_ROLES).toEqual(['chief', 'deputy', 'admin']);
    expect(auth.DEPT_MODE_ROLES).not.toContain('reviewer');
  });
});