import type { Grade } from '@sr/shared';

export interface GradeBadgeProps {
  grade: Grade | null | undefined;
  /** 模块前缀（PE / PC） */
  prefix?: string;
  size?: 'sm' | 'md';
}

/** 成绩等级徽章：E → S+，S+ 暖金渐变 */
export function GradeBadge({ grade, prefix, size = 'md' }: GradeBadgeProps) {
  if (!grade) {
    return (
      <span className={`sr-grade sr-grade--${size} sr-grade--none`}>
        {prefix ? `${prefix} —` : '—'}
      </span>
    );
  }
  return (
    <span className={`sr-grade sr-grade--${size}`} data-grade={grade}>
      {prefix && <span className="sr-grade__prefix">{prefix}</span>}
      <span className="sr-grade__value">{grade}</span>
    </span>
  );
}
