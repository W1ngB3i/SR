import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Empty, Input, Modal, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  APPEAL_STATUS_LABELS,
  type AppealDTO,
  type AppealStatus,
  type Page,
} from '@sr/shared';
import { fetchAppeals, handleAppeal } from '../api/admin';
import { ApiClientError } from '../api/client';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: AppealStatus; label: string }[] = Object.entries(
  APPEAL_STATUS_LABELS,
).map(([value, label]) => ({ value: value as AppealStatus, label }));

const STATUS_TAG_CLASS: Record<AppealStatus, string> = {
  open: 'appeal-tag--open',
  resolved: 'appeal-tag--resolved',
  dismissed: 'appeal-tag--dismissed',
};

export function AppealsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();

  const [status, setStatus] = useState<AppealStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AppealDTO> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchAppeals({ status, page, page_size: PAGE_SIZE }));
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openHandle = (row: AppealDTO, action: 'resolve' | 'dismiss') => {
    let note = '';
    modal.confirm({
      title: action === 'resolve' ? `采纳申诉：${row.circle_name}` : `驳回申诉：${row.circle_name}`,
      content: (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: '#6d7890', marginBottom: 8, fontSize: 13 }}>
            {action === 'resolve'
              ? '采纳后请根据实际情况修订工单回执或重新走审核流程。'
              : '驳回后申诉记录保留，申请人可再次提交新的申诉。'}
          </p>
          <Input.TextArea
            rows={3}
            maxLength={300}
            placeholder="处理说明（可选）"
            onChange={(e) => {
              note = e.target.value;
            }}
          />
        </div>
      ),
      okText: action === 'resolve' ? '确认采纳' : '确认驳回',
      okButtonProps: { danger: action === 'dismiss' },
      cancelText: '取消',
      onOk: async () => {
        try {
          await handleAppeal(row.id, action, note.trim());
          message.success(action === 'resolve' ? '申诉已采纳' : '申诉已驳回');
          void load();
        } catch (err) {
          if (err instanceof ApiClientError) message.error(err.message);
          throw err;
        }
      },
    });
  };

  const columns: ColumnsType<AppealDTO> = [
    {
      title: '提交时间',
      dataIndex: 'created_at',
      width: 160,
      render: (t: string) => <span className="pool-time">{dayjs(t).format('YYYY-MM-DD HH:mm')}</span>,
    },
    {
      title: '圈名',
      dataIndex: 'circle_name',
      width: 110,
      render: (v: string, row) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/tickets/${row.ticket_id}`)}>
          {v}
        </Button>
      ),
    },
    {
      title: '部门 / 模式',
      key: 'rule',
      width: 200,
      render: (_, row) => (
        <span className="pool-time">
          {row.department_name} · {row.mode_name}
        </span>
      ),
    },
    {
      title: '申诉理由',
      dataIndex: 'reason',
      render: (v: string, row) => (
        <div>
          <p style={{ margin: 0, lineHeight: 1.7 }}>{v}</p>
          {row.contact && <span className="pool-time">联系方式：{row.contact}</span>}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: AppealStatus) => (
        <Tag className={`appeal-tag ${STATUS_TAG_CLASS[s]}`}>{APPEAL_STATUS_LABELS[s]}</Tag>
      ),
    },
    {
      title: '处理结果',
      key: 'handle',
      width: 200,
      render: (_, row) =>
        row.status === 'open' ? (
          <span className="pool-time">—</span>
        ) : (
          <div>
            <span className="pool-time">
              {row.handled_by_name ?? '—'} ·{' '}
              {row.handled_at ? dayjs(row.handled_at).format('MM-DD HH:mm') : '—'}
            </span>
            {row.handle_note && <p style={{ margin: '2px 0 0', fontSize: 12.5 }}>{row.handle_note}</p>}
          </div>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, row) =>
        row.status === 'open' ? (
          <>
            <Button type="primary" size="small" onClick={() => openHandle(row, 'resolve')}>
              采纳
            </Button>
            <Button size="small" danger style={{ marginLeft: 8 }} onClick={() => openHandle(row, 'dismiss')}>
              驳回
            </Button>
          </>
        ) : (
          <span className="pool-time">已处理</span>
        ),
    },
  ];

  return (
    <div className="appeal-page">
      <div className="page-hero">
        <h1 className="page-hero__title">申诉处理</h1>
        <p className="page-hero__desc">
          申请人对审核结果有异议时提交的申诉记录，由总管/副总管采纳或驳回。
        </p>
      </div>

      <div className="sr-glass pool-filter">
        <Select
          allowClear
          placeholder="按状态筛选"
          className="pool-filter__select pool-filter__select--sm"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(v) => {
            setStatus(v ?? undefined);
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
        <Table<AppealDTO>
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
          locale={{ emptyText: <Empty description="暂无申诉记录" /> }}
        />
      </div>
    </div>
  );
}
