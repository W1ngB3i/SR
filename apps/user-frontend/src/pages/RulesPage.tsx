import { useEffect, useRef, useState } from 'react';
import { Skeleton } from 'antd';
import {
  DEVICE_NOTES,
  GRADES,
  type Grade,
  type RulesBundleDTO,
} from '@sr/shared';
import { GlassCard, GradeBadge, staggerReveal } from '@sr/ui';
import { fetchRules } from '../api/public';
import { ApiClientError } from '../api/client';

const GRADE_ORDER: readonly Grade[] = GRADES;

/** 审核规则页：部门与模式总览、设备界定、等级阶梯、反馈渠道 */
export function RulesPage() {
  const [bundle, setBundle] = useState<RulesBundleDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchRules()
      .then((data) => {
        if (alive) setBundle(data);
      })
      .catch((err: ApiClientError) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (listRef.current && bundle) {
      staggerReveal(listRef.current.querySelectorAll('.rules-dept'), {
        each: 0.08,
        y: 24,
        duration: 0.8,
      });
    }
  }, [bundle]);

  if (error) {
    return (
      <div className="page-hero">
        <h1 className="page-hero__title">审核规则</h1>
        <p className="page-hero__desc" style={{ color: '#e88b8b' }}>
          规则加载失败：{error}
        </p>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="page-hero">
        <h1 className="page-hero__title">审核规则</h1>
        <GlassCard className="form-card">
          <Skeleton active paragraph={{ rows: 10 }} />
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="page-hero">
      <div className="page-hero__eyebrow">Rules</div>
      <h1 className="page-hero__title">审核规则</h1>
      <p className="page-hero__desc">
        各部门审核模式、设备界定与等级阶梯一览。规则以本页与提交表单中的实时数据为准，配置中心变更后自动生效。
      </p>

      <div className="rules-departments" ref={listRef}>
        {bundle.departments.map((dept) => (
          <GlassCard key={dept.id} className="rules-dept">
            <div className="rules-dept__head">
              <span className="rules-dept__name">{dept.name}</span>
              {dept.tier && <span className="rules-dept__tier">难度 {dept.tier}</span>}
              {dept.contact && <span className="rules-dept__contact">{dept.contact}</span>}
            </div>
            {dept.description && <p className="rules-dept__desc">{dept.description}</p>}
            {dept.modes.length > 0 && (
              <div className="rules-dept__modes">
                {dept.modes.map((mode) => (
                  <div key={mode.id} className="rules-mode">
                    <div className="rules-mode__group">{mode.group_name || '常规'}</div>
                    <div className="rules-mode__name">{mode.name}</div>
                    {mode.min_requirement && (
                      <div className="rules-mode__req">最低要求：{mode.min_requirement}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        ))}
      </div>

      <div className="rules-section">
        <div className="rules-section__title">设备界定</div>
        <GlassCard className="form-card">
          <ul className="hint-lines">
            {bundle.device_notes.length > 0
              ? bundle.device_notes.map((note) => <li key={note}>{note}</li>)
              : DEVICE_NOTES.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </GlassCard>
      </div>

      <div className="rules-section">
        <div className="rules-section__title">成绩等级阶梯</div>
        <GlassCard className="form-card">
          <div className="rules-grades">
            {GRADE_ORDER.map((grade) => (
              <GradeBadge key={grade} grade={grade} />
            ))}
          </div>
          <p
            style={{
              marginTop: 14,
              fontSize: 12.5,
              color: 'var(--sr-text-low)',
              lineHeight: 1.8,
            }}
          >
            自 E 至 S+ 逐级抬升，双端（PE / PC）分别评级；具体标准以群管家口径为准。
          </p>
        </GlassCard>
      </div>

      <div className="rules-section">
        <div className="rules-section__title">反馈渠道</div>
        <div className="rules-contacts">
          <GlassCard className="rules-contact">
            <div className="rules-contact__role">审核总管</div>
            <div className="rules-contact__name">{bundle.feedback_contacts.chief.name}</div>
            <div className="rules-contact__qq">QQ {bundle.feedback_contacts.chief.qq}</div>
          </GlassCard>
          <GlassCard className="rules-contact">
            <div className="rules-contact__role">审核副总管</div>
            <div className="rules-contact__name">{bundle.feedback_contacts.deputy.name}</div>
            <div className="rules-contact__qq">QQ {bundle.feedback_contacts.deputy.qq}</div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
