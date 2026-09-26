import { useCallback, useEffect, useState } from 'react';
import { App, Input, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { AuditLogDTO, Page } from '@sr/shared';
import { fetchAuditLogs } from '../api/admin';
import { ApiClientError } from '../api/client';

const PAGE_SIZE = 20;

const ACTION_OPTIONS = [
  'ticket.claim',
  'ticket.assign',
  'ticket.release',
  'ticket.pin',
  'ticket.supplement_request',
  'ticket.review',
  'ticket.publish',
  'receipt.submit',
  'department.create',
  'department.update',
  'department.delete',
  'mode.create',
  'mode.update',
  'mode.delete',
  'user.create',
  'user.update',
  'user.reset_password',
  'announcement.create',
  'announcement.update',
  'announcement.delete',
  'config.set',
].map((v) => ({ value: v, label: v }));

const RESOURCE_OPTIONS = ['ticket', 'department', 'mode', 'user', 'announcement', 'config'].map(
  (v) => ({ value: v, label: v }),
);

function prettyJson(value: string): string {
  if (!value) return '—';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function AuditLogsPage() {
  const { message } = App.useApp();

  const [action, setAction] = useState<string | undefined>();
  const [resource, setResource] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditLogDTO> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await fetchAuditLogs({ action, resource, page, page_size: PAGE_SIZE }),
      );
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [action, resource, page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<AuditLogDTO> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 160,
      render: (t: string) => <span className="pool-time">{dayjs(t).format('YYYY-MM-DD HH:mm:ss')}</span>,
    },
    { title: '操作人', dataIndex: 'operator_name', width: 100 },
    {
      title: '动作',
      dataIndex: 'action',
      width: 180,
      render: (a: string) => <Tag className="audit-action">{a}</Tag>,
    },
    {
      title: '资源',
      dataIndex: 'resource',
      width: 110,
      render: (r: string) => <span className="pool-time">{r}</span>,
    },
    { title: '目标 ID', dataIndex: 'target_id', width: 120, ellipsis: true },
    {
      title: '变更详情',
      key: 'diff',
      render: (_, row) => (
        <div className="audit-diff">
          {row.before && (
            <details>
              <summary>before</summary>
              <pre>{prettyJson(row.before)}</pre>
            </details>
          )}
          {row.after && (
            <details>
              <summary>after</summary>
              <pre>{prettyJson(row.after)}</pre>
            </details>
          )}
          {!row.before && !row.after && <span className="pool-empty">—</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="audit-page">
      <div className="page-hero">
        <h1 className="page-hero__title">审计日志</h1>
        <p className="page-hero__desc">只增不删的操作留痕，覆盖工单流转与后台配置的全部变更</p>
      </div>

      <div className="sr-glass pool-filter">
        <Select
          allowClear
          placeholder="按动作筛选"
          className="pool-filter__select"
          style={{ minWidth: 200 }}
          options={ACTION_OPTIONS}
          value={action}
          showSearch
          onChange={(v) => {
            setAction(v ?? undefined);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="按资源筛选"
          className="pool-filter__select pool-filter__select--sm"
          options={RESOURCE_OPTIONS}
          value={resource}
          onChange={(v) => {
            setResource(v ?? undefined);
            setPage(1);
          }}
        />
        <Input
          className="pool-filter__keyword"
          disabled
          placeholder="共"
          style={{ maxWidth: 140, textAlign: 'center' }}
          value={`共 ${data?.total ?? 0} 条`}
        />
      </div>

      <div className="sr-glass pool-table">
        <Table<AuditLogDTO>
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={loading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            onChange: (p) => setPage(p),
          }}
          locale={{ emptyText: '暂无匹配的日志' }}
        />
      </div>
    </div>
  );
}
