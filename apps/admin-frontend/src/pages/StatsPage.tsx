import { useEffect, useState } from 'react';
import { App, Tag } from 'antd';
import dayjs from 'dayjs';
import {
  STATUS_LABELS,
  type StatsDTO,
  type TicketStatus,
} from '@sr/shared';
import { GradeBadge } from '@sr/ui';
import { fetchStats } from '../api/admin';
import { ApiClientError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const STATUS_ORDER: TicketStatus[] = [
  'pending_claim',
  'reviewing',
  'supplementing',
  'resulted',
  'published',
];

export function StatsPage() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsDTO | null>(null);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((err) => {
        if (err instanceof ApiClientError) message.error(err.message);
      });
  }, [message]);

  if (!stats) {
    return <div className="sr-glass detail-loading">正在加载统计数据…</div>;
  }

  const maxDept = Math.max(1, ...stats.per_department.map((d) => d.count));
  const secondary = [
    { label: '今日新增', value: stats.today_new },
    {
      label: '平均审核时长',
      value: stats.avg_review_hours === null ? '—' : `${stats.avg_review_hours} 小时`,
    },
    { label: '累计公示', value: stats.total_published },
    { label: '在办审核员', value: stats.active_reviewers },
  ];

  return (
    <div className="stats-page">
      <div className="page-hero">
        <h1 className="page-hero__title">仪表盘</h1>
        <p className="page-hero__desc">你好，{user?.name}。这里是审核平台的实时概览</p>
      </div>

      <div className="stats-status">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="sr-glass stats-card" data-status={s}>
            <span className="stats-card__value">{stats.status_counts[s] ?? 0}</span>
            <span className="stats-card__label">{STATUS_LABELS[s]}</span>
          </div>
        ))}
      </div>

      <div className="stats-secondary">
        {secondary.map((item) => (
          <div key={item.label} className="sr-glass stats-mini">
            <span className="stats-mini__value">{item.value}</span>
            <span className="stats-mini__label">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="stats-bottom">
        <section className="sr-glass detail-card stats-dept">
          <h2 className="detail-card__title">各部门工单量</h2>
          {stats.per_department.length === 0 && <p className="detail-empty">暂无数据</p>}
          {stats.per_department.map((d) => (
            <div key={d.department_id} className="stats-dept__row">
              <span className="stats-dept__name">{d.department_name}</span>
              <div className="stats-dept__bar">
                <span
                  className="stats-dept__fill"
                  style={{ width: `${(d.count / maxDept) * 100}%` }}
                />
              </div>
              <span className="stats-dept__count">{d.count}</span>
            </div>
          ))}
        </section>

        <section className="sr-glass detail-card stats-recent">
          <h2 className="detail-card__title">最近公示</h2>
          {stats.recent_published.length === 0 && <p className="detail-empty">暂无公示</p>}
          <div className="stats-recent__list">
            {stats.recent_published.map((p) => (
              <div key={p.id} className="stats-recent__item">
                <div className="stats-recent__grades">
                  {p.pe_grade && <GradeBadge grade={p.pe_grade} size="sm" />}
                  {p.pc_grade && <GradeBadge grade={p.pc_grade} size="sm" />}
                  {!p.pe_grade && !p.pc_grade && <Tag>无成绩</Tag>}
                </div>
                <div className="stats-recent__body">
                  <span className="stats-recent__name">{p.circle_name_masked}</span>
                  <span className="stats-recent__meta">
                    {p.mode_name} · {p.pass ? '通过' : '不通过'} · {p.auditor_name}
                  </span>
                </div>
                <span className="stats-recent__time">{dayjs(p.published_at).format('MM-DD')}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
