import { useEffect, useRef, useState } from 'react';
import { Input, Pagination, Select, Skeleton } from 'antd';
import dayjs from 'dayjs';
import {
  MODULE_LABELS,
  type AnnouncementDTO,
  type DepartmentDTO,
  type Page,
  type PublicityItemDTO,
} from '@sr/shared';
import { GlassCard, GradeBadge, revealGrade, staggerReveal } from '@sr/ui';
import { fetchAnnouncements, fetchPublished, fetchRules } from '../api/public';

const PAGE_SIZE = 12;

/** 结果公示页：公告位 + 脱敏公示卡片流 + 分页 */
export function PublishedPage() {
  const [announcements, setAnnouncements] = useState<AnnouncementDTO[]>([]);
  const [departments, setDepartments] = useState<DepartmentDTO[]>([]);
  const [pageData, setPageData] = useState<Page<PublicityItemDTO> | null>(null);
  const [page, setPage] = useState(1);
  const [deptId, setDeptId] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const announceRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRules()
      .then((bundle) => setDepartments(bundle.departments))
      .catch(() => setDepartments([]));
    fetchAnnouncements()
      .then((list) => setAnnouncements(list))
      .catch(() => setAnnouncements([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPublished({ page, page_size: PAGE_SIZE, department_id: deptId, keyword })
      .then((data) => {
        if (alive) setPageData(data);
      })
      .catch(() => {
        if (alive) setPageData({ items: [], page, page_size: PAGE_SIZE, total: 0 });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, deptId, keyword]);

  useEffect(() => {
    if (announceRef.current && announcements.length > 0) {
      staggerReveal(announceRef.current.querySelectorAll('.pub-announcement'), {
        each: 0.09,
        y: 14,
        duration: 0.7,
      });
    }
  }, [announcements]);

  useEffect(() => {
    if (gridRef.current && !loading && pageData && pageData.items.length > 0) {
      staggerReveal(gridRef.current.querySelectorAll('.pub-card'), {
        each: 0.06,
        y: 26,
        duration: 0.8,
        delay: 0.05,
      });
      revealGrade(gridRef.current.querySelectorAll('.sr-grade'), 0.4);
    }
  }, [loading, pageData]);

  return (
    <div className="page-hero">
      <div className="page-hero__eyebrow">Published</div>
      <h1 className="page-hero__title">结果公示</h1>
      <p className="page-hero__desc">
        通过复核的审核结果在此公示。为保护隐私，圈名做脱敏处理，仅展示等级与结论。
      </p>

      {announcements.length > 0 && (
        <div className="pub-announcements" ref={announceRef}>
          {announcements.map((a) => (
            <GlassCard key={a.id} className="pub-announcement">
              <div className="pub-announcement__title">
                {a.pinned && <span className="pub-announcement__pin">置顶</span>}
                <span>{a.title}</span>
              </div>
              <div className="pub-announcement__content">{a.content}</div>
              <div className="pub-announcement__time">
                {dayjs(a.created_at).format('YYYY-MM-DD HH:mm')}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <div className="pub-toolbar">
        <Select
          allowClear
          placeholder="按部门筛选"
          value={deptId}
          onChange={(v) => {
            setPage(1);
            setDeptId(v);
          }}
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
          style={{ minWidth: 220 }}
        />
        <Input.Search
          placeholder="搜索脱敏圈名 / 部门 / 模式"
          allowClear
          enterButton
          onSearch={(v) => {
            setPage(1);
            setKeyword(v.trim());
          }}
        />
      </div>

      {loading ? (
        <GlassCard className="form-card">
          <Skeleton active paragraph={{ rows: 8 }} />
        </GlassCard>
      ) : !pageData || pageData.items.length === 0 ? (
        <GlassCard className="form-card">
          <div className="pub-empty">暂无符合条件的公示记录</div>
        </GlassCard>
      ) : (
        <>
          <div className="pub-grid" ref={gridRef}>
            {pageData.items.map((item) => (
              <GlassCard key={item.id} className="pub-card">
                <div className="pub-card__top">
                  <span className="pub-card__name">{item.circle_name_masked}</span>
                  <span className="pub-card__module">
                    {item.module === 'BOTH' ? 'PE + PC' : item.module}
                  </span>
                </div>
                <div className="pub-card__dept">
                  {item.department_name} · {item.mode_name}
                  {item.mode_group ? `（${item.mode_group}）` : ''}
                </div>
                <div className="pub-card__grades">
                  <GradeBadge grade={item.pe_grade} prefix="PE" size="sm" />
                  <GradeBadge grade={item.pc_grade} prefix="PC" size="sm" />
                  <span
                    className={`pub-card__verdict ${
                      item.pass ? 'pub-card__verdict--pass' : 'pub-card__verdict--fail'
                    }`}
                  >
                    {item.pass ? '通过' : '未通过'}
                  </span>
                </div>
                {item.comment && <div className="pub-card__comment">{item.comment}</div>}
                <div className="pub-card__foot">
                  <span>审核 {item.auditor_name}</span>
                  <span>{dayjs(item.published_at).format('YYYY-MM-DD')}</span>
                </div>
              </GlassCard>
            ))}
          </div>
          {pageData.total > PAGE_SIZE && (
            <div className="pub-footer">
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={pageData.total}
                onChange={setPage}
                showSizeChanger={false}
                showTotal={(t) => `共 ${t} 条公示`}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
