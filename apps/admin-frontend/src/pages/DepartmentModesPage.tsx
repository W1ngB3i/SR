import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Empty, Input, Skeleton, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { DepartmentModeOverviewDTO, ModeDTO } from '@sr/shared';
import { fetchDepartmentModesOverview, putDepartmentModes } from '../api/admin';
import { ApiClientError } from '../api/client';

/** 分组展示顺序；模式没有 group_name 时按名称前缀归档，未知项落到「其他」 */
const GROUP_ORDER = ['EC', 'BE国际服', '布吉岛', 'Java低版本', 'Java高版本', 'Misaki', '其他'];
const NAME_GROUPS = GROUP_ORDER.filter((group) => group !== '其他');

function groupOf(mode: ModeDTO): string {
  if (mode.group_name) return mode.group_name;
  for (const group of NAME_GROUPS) {
    if (mode.name.startsWith(group)) return group;
  }
  return '其他';
}

function groupRank(group: string): number {
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
}

export function DepartmentModesPage() {
  const { message, modal } = App.useApp();

  const [overview, setOverview] = useState<DepartmentModeOverviewDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDepartmentModesOverview();
      setOverview(data);
      setSelectedDeptId((prev) => prev ?? data.departments[0]?.id ?? null);
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const modes = useMemo(() => overview?.modes ?? [], [overview]);
  const selectedDept = useMemo(
    () => overview?.departments.find((dept) => dept.id === selectedDeptId) ?? null,
    [overview, selectedDeptId],
  );
  /** 服务端已保存的开放关系，作为「未保存变更」的比对基线 */
  const baseline = useMemo(
    () => new Set(overview && selectedDeptId ? overview.open_mode_ids[selectedDeptId] ?? [] : []),
    [overview, selectedDeptId],
  );

  // 切换部门或保存成功后，用服务端值重新初始化草稿
  useEffect(() => {
    setDraft(new Set(baseline));
    setKeyword('');
  }, [baseline]);

  const dirty = useMemo(() => {
    if (baseline.size !== draft.size) return true;
    for (const id of draft) if (!baseline.has(id)) return true;
    return false;
  }, [baseline, draft]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return kw ? modes.filter((mode) => mode.name.toLowerCase().includes(kw)) : modes;
  }, [modes, keyword]);

  const groups = useMemo(() => {
    const map = new Map<string, ModeDTO[]>();
    for (const mode of filtered) {
      const key = groupOf(mode);
      const list = map.get(key);
      if (list) list.push(mode);
      else map.set(key, [mode]);
    }
    return [...map.entries()].sort(
      (a, b) => groupRank(a[0]) - groupRank(b[0]) || a[0].localeCompare(b[0], 'zh'),
    );
  }, [filtered]);

  const openCount = useCallback(
    (departmentId: string) => (overview?.open_mode_ids[departmentId] ?? []).length,
    [overview],
  );

  const toggleMode = (modeId: string, checked: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (checked) next.add(modeId);
      else next.delete(modeId);
      return next;
    });
  };

  const toggleGroup = (groupModes: ModeDTO[], select: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const mode of groupModes) {
        if (select) next.add(mode.id);
        else next.delete(mode.id);
      }
      return next;
    });
  };

  /** 有未保存变更时切换部门先确认，避免静默丢弃勾选 */
  const selectDept = (departmentId: string) => {
    if (departmentId === selectedDeptId) return;
    if (dirty) {
      modal.confirm({
        title: '放弃未保存的修改？',
        content: '切换部门会丢弃当前未保存的勾选变更。',
        okText: '放弃并切换',
        cancelText: '继续编辑',
        onOk: () => setSelectedDeptId(departmentId),
      });
      return;
    }
    setSelectedDeptId(departmentId);
  };

  const save = async () => {
    if (!selectedDeptId) return;
    setSaving(true);
    try {
      const result = await putDepartmentModes(selectedDeptId, [...draft]);
      setOverview((prev) =>
        prev
          ? { ...prev, open_mode_ids: { ...prev.open_mode_ids, [selectedDeptId]: result.mode_ids } }
          : prev,
      );
      message.success(`「${selectedDept?.name ?? '部门'}」的开放模式已保存`);
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dept-mode-page">
      <div className="page-hero page-hero--row">
        <div>
          <h1 className="page-hero__title">部门模式管理</h1>
          <p className="page-hero__desc">
            按部门勾选开放的审核模式；保存后申请页下拉、机器人规则查询与规则图自动跟随。
          </p>
        </div>
        <div className="dept-mode-save">
          {dirty && <span className="dept-mode-save__flag">有未保存变更</span>}
          <Button
            type="primary"
            loading={saving}
            disabled={!dirty || !selectedDeptId}
            onClick={() => void save()}
          >
            保存
          </Button>
        </div>
      </div>

      {loading && !overview ? (
        <div className="sr-glass dept-mode-skeleton">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : !overview ? (
        <div className="sr-glass dept-mode-skeleton">
          <Empty description="配置加载失败">
            <Button onClick={() => void load()}>重试</Button>
          </Empty>
        </div>
      ) : (
        <div className="dept-mode-grid">
          <aside className="sr-glass dept-mode-depts">
            <div className="dept-mode-depts__title">审核部门</div>
            {overview.departments.map((dept) => (
              <button
                key={dept.id}
                type="button"
                className={`dept-mode-dept ${dept.id === selectedDeptId ? 'is-active' : ''}`}
                onClick={() => selectDept(dept.id)}
              >
                <span className="dept-mode-dept__main">
                  <span className="dept-mode-dept__name">{dept.name}</span>
                  {dept.tier && <Tag className="dept-mode-dept__tier">{dept.tier}</Tag>}
                  {!dept.enabled && <Tag color="default">已停用</Tag>}
                </span>
                <span className="dept-mode-dept__count">
                  {openCount(dept.id)} / {modes.length}
                </span>
              </button>
            ))}
          </aside>

          <section className="sr-glass dept-mode-config">
            {!selectedDept ? (
              <Empty description="暂无部门" />
            ) : (
              <>
                <header className="dept-mode-config__head">
                  <div className="dept-mode-config__title">
                    <span>{selectedDept.name} 开放的模式</span>
                    <span className="dept-mode-config__sub">
                      已选 {draft.size} / {modes.length}
                    </span>
                  </div>
                  <div className="dept-mode-config__tools">
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="搜索模式名称"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      className="dept-mode-config__search"
                    />
                    <Button size="small" onClick={() => setDraft(new Set(modes.map((m) => m.id)))}>
                      全选
                    </Button>
                    <Button size="small" onClick={() => setDraft(new Set())}>
                      清空
                    </Button>
                  </div>
                </header>

                {baseline.size === 0 && (
                  <div className="dept-mode-config__empty">该部门暂未开放任何审核模式</div>
                )}

                {groups.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的模式" />
                ) : (
                  <div className="dept-mode-groups">
                    {groups.map(([group, groupModes]) => {
                      const checked = groupModes.filter((mode) => draft.has(mode.id)).length;
                      const allSelected = checked === groupModes.length;
                      return (
                        <div className="dept-mode-group" key={group}>
                          <div className="dept-mode-group__head">
                            <span className="dept-mode-group__name">{group}</span>
                            <span className="dept-mode-group__count">
                              {checked} / {groupModes.length}
                            </span>
                            <button
                              type="button"
                              className="dept-mode-group__toggle"
                              onClick={() => toggleGroup(groupModes, !allSelected)}
                            >
                              {allSelected ? '取消本组' : '全选本组'}
                            </button>
                          </div>
                          <div className="dept-mode-group__items">
                            {groupModes.map((mode) => {
                              const isChecked = draft.has(mode.id);
                              return (
                                <div
                                  key={mode.id}
                                  className={`dept-mode-item ${isChecked ? 'is-checked' : ''}`}
                                  role="checkbox"
                                  aria-checked={isChecked}
                                  tabIndex={0}
                                  onClick={() => toggleMode(mode.id, !isChecked)}
                                  onKeyDown={(event) => {
                                    if (event.key === ' ' || event.key === 'Enter') {
                                      event.preventDefault();
                                      toggleMode(mode.id, !isChecked);
                                    }
                                  }}
                                >
                                  <Checkbox checked={isChecked} tabIndex={-1} onChange={() => undefined} />
                                  <span className="dept-mode-item__body">
                                    <span className="dept-mode-item__name">{mode.name}</span>
                                    {mode.min_requirement && (
                                      <span className="dept-mode-item__req">{mode.min_requirement}</span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}