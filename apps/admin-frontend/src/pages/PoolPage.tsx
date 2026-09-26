import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Input, Modal, Select, Table, Tabs, Tag, Tooltip } from 'antd';
import { SearchOutlined, StarFilled } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  MODULE_LABELS,
  type Page,
  type RulesBundleDTO,
  type StaffUserDTO,
  type TicketSummaryDTO,
} from '@sr/shared';
import { StatusTag } from '@sr/ui';
import { fetchRules } from '../api/publicRules';
import {
  assignTicket,
  claimTicket,
  fetchAssignables,
  fetchTickets,
  releaseTicket,
  togglePin,
} from '../api/staff';
import { useAuth } from '../auth/AuthContext';
import { canManage } from '../roles';
import { ApiClientError } from '../api/client';

const PAGE_SIZE = 12;

type TabKey = 'pending' | 'mine' | 'all';

const TAB_DEFS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: '待接单' },
  { key: 'mine', label: '我的在办' },
  { key: 'all', label: '全部工单' },
];

interface PoolFilters {
  department_id?: string;
  module?: string;
  keyword?: string;
}

export function PoolPage() {
  const { user } = useAuth();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>('pending');
  const [filters, setFilters] = useState<PoolFilters>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<TicketSummaryDTO> | null>(null);
  const [loading, setLoading] = useState(false);

  const [rules, setRules] = useState<RulesBundleDTO | null>(null);
  const [assignTarget, setAssignTarget] = useState<TicketSummaryDTO | null>(null);
  const [assignables, setAssignables] = useState<StaffUserDTO[]>([]);
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [assignLoading, setAssignLoading] = useState(false);

  const isManager = canManage(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query: Parameters<typeof fetchTickets>[0] = {
        page,
        page_size: PAGE_SIZE,
        department_id: filters.department_id,
        module: filters.module,
        keyword: filters.keyword,
      };
      if (tab === 'pending') query.status = 'pending_claim';
      if (tab === 'mine') {
        query.mine = '1';
        query.status = 'reviewing,supplementing,resulted';
      }
      setData(await fetchTickets(query));
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, page, filters, message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (rules) return;
    fetchRules()
      .then(setRules)
      .catch(() => undefined);
  }, [rules]);

  const handleClaim = async (ticket: TicketSummaryDTO) => {
    try {
      await claimTicket(ticket.id);
      message.success(`已接单：${ticket.circle_name}`);
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        message.warning(err.message);
        void load();
      }
    }
  };

  const handleRelease = (ticket: TicketSummaryDTO) => {
    let reason = '';
    modal.confirm({
      title: `释放工单：${ticket.circle_name}`,
      content: (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: '#6d7890', marginBottom: 8, fontSize: 13 }}>
            释放后工单回到公单池，其他审核员可以接手
          </p>
          <Input.TextArea
            rows={3}
            maxLength={200}
            placeholder="释放原因（可选，会记入时间线）"
            onChange={(e) => {
              reason = e.target.value;
            }}
          />
        </div>
      ),
      okText: '确认释放',
      cancelText: '取消',
      onOk: async () => {
        try {
          await releaseTicket(ticket.id, reason);
          message.success('已释放回公单池');
          void load();
        } catch (err) {
          if (err instanceof ApiClientError) message.error(err.message);
          throw err;
        }
      },
    });
  };

  const handlePin = async (ticket: TicketSummaryDTO) => {
    try {
      const next = await togglePin(ticket.id);
      message.success(next.is_priority ? '已置顶优先' : '已取消置顶');
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    }
  };

  const openAssign = async (ticket: TicketSummaryDTO) => {
    setAssignTarget(ticket);
    setAssigneeId(undefined);
    try {
      setAssignables(await fetchAssignables());
    } catch {
      setAssignables([]);
    }
  };

  const handleAssign = async () => {
    if (!assignTarget || !assigneeId) return;
    setAssignLoading(true);
    try {
      await assignTicket(assignTarget.id, assigneeId);
      message.success('指派成功');
      setAssignTarget(null);
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        message.error(err.message);
        void load();
      }
    } finally {
      setAssignLoading(false);
    }
  };

  const columns: ColumnsType<TicketSummaryDTO> = useMemo(
    () => [
      {
        title: '圈名',
        dataIndex: 'circle_name',
        width: 170,
        render: (name: string, row) => (
          <span className="pool-circle">
            {row.is_priority && (
              <Tooltip title="总管置顶优先">
                <StarFilled className="pool-circle__star" />
              </Tooltip>
            )}
            <span className="pool-circle__name">{name}</span>
          </span>
        ),
      },
      {
        title: '部门 / 模式',
        width: 220,
        render: (_, row) => (
          <div className="pool-dept">
            <span className="pool-dept__name">
              {row.department_name} · {row.mode_group ? `${row.mode_group} / ` : ''}
              {row.mode_name}
            </span>
          </div>
        ),
      },
      {
        title: '模块',
        dataIndex: 'module',
        width: 140,
        render: (m: TicketSummaryDTO['module']) => (
          <Tag className="pool-module">{MODULE_LABELS[m]}</Tag>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: (s: TicketSummaryDTO['status']) => <StatusTag status={s} />,
      },
      {
        title: '负责人',
        dataIndex: 'assignee_name',
        width: 100,
        render: (name: string | null) => name ?? <span className="pool-empty">—</span>,
      },
      {
        title: '提交时间',
        dataIndex: 'created_at',
        width: 130,
        render: (t: string) => <span className="pool-time">{dayjs(t).format('MM-DD HH:mm')}</span>,
      },
      {
        title: '操作',
        key: 'actions',
        width: isManager ? 250 : 170,
        render: (_, row) => (
          <div className="pool-actions" onClick={(e) => e.stopPropagation()}>
            {row.status === 'pending_claim' && (
              <Button size="small" type="primary" onClick={() => void handleClaim(row)}>
                接单
              </Button>
            )}
            {row.status === 'pending_claim' && isManager && (
              <Button size="small" onClick={() => void openAssign(row)}>
                指派
              </Button>
            )}
            {isManager && row.status !== 'pending_claim' && row.status !== 'published' && (
              <>
                <Button size="small" onClick={() => handleRelease(row)}>
                  释放
                </Button>
                <Button
                  size="small"
                  title={row.is_priority ? '取消置顶' : '置顶优先'}
                  onClick={() => void handlePin(row)}
                  icon={
                    <StarFilled
                      style={row.is_priority ? { color: '#ffd98a' } : undefined}
                    />
                  }
                />
              </>
            )}
            <Button size="small" type="link" onClick={() => navigate(`/tickets/${row.id}`)}>
              详情
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isManager],
  );

  const departmentOptions = useMemo(
    () =>
      (rules?.departments ?? [])
        .filter((d) => d.enabled)
        .map((d) => ({ value: d.id, label: d.name })),
    [rules],
  );

  return (
    <div className="pool-page">
      <div className="page-hero">
        <h1 className="page-hero__title">工单池</h1>
        <p className="page-hero__desc">
          待接单工单先到先得；{isManager ? '总管可指派、释放与置顶' : '接单后进入「我的在办」处理'}
        </p>
      </div>

      <div className="sr-glass pool-filter">
        <Input.Search
          allowClear
          placeholder="搜索圈名，回车确认"
          className="pool-filter__keyword"
          onSearch={(v) => {
            setFilters((f) => ({ ...f, keyword: v.trim() || undefined }));
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="部门"
          className="pool-filter__select"
          options={departmentOptions}
          value={filters.department_id}
          onChange={(v) => {
            setFilters((f) => ({ ...f, department_id: v ?? undefined }));
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="模块"
          className="pool-filter__select pool-filter__select--sm"
          options={[
            { value: 'PE', label: 'PE 触屏' },
            { value: 'PC', label: 'PC 键鼠' },
            { value: 'BOTH', label: '双端' },
          ]}
          value={filters.module}
          onChange={(v) => {
            setFilters((f) => ({ ...f, module: v ?? undefined }));
            setPage(1);
          }}
        />
      </div>

      <Tabs
        activeKey={tab}
        onChange={(k) => {
          setTab(k as TabKey);
          setPage(1);
        }}
        items={TAB_DEFS.map((t) => ({ key: t.key, label: t.label }))}
        className="pool-tabs"
      />

      <div className="sr-glass pool-table">
        <Table<TicketSummaryDTO>
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={loading}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            onChange: (p) => setPage(p),
          }}
          onRow={(row) => ({
            onClick: () => navigate(`/tickets/${row.id}`),
            style: { cursor: 'pointer' },
          })}
          locale={{ emptyText: '当前筛选下暂无工单' }}
        />
      </div>

      <Modal
        title={assignTarget ? `指派工单：${assignTarget.circle_name}` : '指派工单'}
        open={!!assignTarget}
        confirmLoading={assignLoading}
        okText="确认指派"
        cancelText="取消"
        okButtonProps={{ disabled: !assigneeId }}
        onOk={() => void handleAssign()}
        onCancel={() => setAssignTarget(null)}
        destroyOnHidden
      >
        <p style={{ marginBottom: 12, color: '#6d7890', fontSize: 13 }}>
          指派后工单直接进入该审核员的「我的在办」；括号内为特长标注，供指派参考
        </p>
        <Select
          style={{ width: '100%' }}
          placeholder="选择审核人员"
          value={assigneeId}
          onChange={setAssigneeId}
          options={assignables.map((u) => ({
            value: u.id,
            label: `${u.name}${u.skills ? `（${u.skills}）` : `（${u.username}）`}`,
          }))}
          optionFilterProp="label"
          showSearch
        />
      </Modal>
    </div>
  );
}
