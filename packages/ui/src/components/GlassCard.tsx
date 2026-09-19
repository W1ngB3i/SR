import type { HTMLAttributes } from 'react';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** 玻璃强度：normal 常规面板 / strong 主面板 */
  tone?: 'normal' | 'strong';
}

/** 液态玻璃卡片：多层折射面，hover 仅提升描边亮度 */
export function GlassCard({ tone = 'normal', className, ...rest }: GlassCardProps) {
  return (
    <div
      className={`sr-glass sr-glass--${tone}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}
