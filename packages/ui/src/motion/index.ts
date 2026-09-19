import gsap from 'gsap';

/** 动效目标：元素 / 元素数组 / 节点集合 / 选择器 */
type RevealTarget = Element | Element[] | NodeListOf<Element> | string | null | undefined;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function toElements(target: RevealTarget): Element[] {
  if (!target) return [];
  if (typeof target === 'string') return [...document.querySelectorAll(target)];
  if (target instanceof Element) return [target];
  return [...(target as Iterable<Element>)];
}

export interface StaggerOptions {
  /** 元素间错峰间隔（秒） */
  each?: number;
  duration?: number;
  y?: number;
  delay?: number;
  staggerFrom?: 'start' | 'center' | 'end';
}

/**
 * 列表错峰入场：power3.out 自然阻尼、逐项延迟。
 * reduced-motion 时直接置为可见，不做位移。
 */
export function staggerReveal(
  target: RevealTarget,
  options: StaggerOptions = {},
): gsap.core.Tween | undefined {
  const els = toElements(target);
  if (els.length === 0) return undefined;
  if (prefersReducedMotion()) {
    gsap.set(els, { opacity: 1, y: 0 });
    return undefined;
  }
  const { each = 0.07, duration = 0.85, y = 22, delay = 0, staggerFrom = 'start' } = options;
  return gsap.fromTo(
    els,
    { opacity: 0, y },
    {
      opacity: 1,
      y: 0,
      duration,
      delay,
      ease: 'power3.out',
      stagger: { each, from: staggerFrom },
      clearProps: 'transform',
      overwrite: 'auto',
    },
  );
}

export interface RevealNodeOptions {
  delay?: number;
  duration?: number;
  y?: number;
}

/**
 * 单节点揭晓：轻微模糊退散 + 上浮，用于标题、结果区块。
 */
export function revealNode(
  target: RevealTarget,
  options: RevealNodeOptions = {},
): gsap.core.Tween | undefined {
  const els = toElements(target);
  if (els.length === 0) return undefined;
  if (prefersReducedMotion()) return undefined;
  const { delay = 0, duration = 0.7, y = 18 } = options;
  return gsap.fromTo(
    els,
    { opacity: 0, y, filter: 'blur(6px)' },
    {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration,
      delay,
      ease: 'power3.out',
      clearProps: 'filter,transform',
      overwrite: 'auto',
    },
  );
}

/**
 * 等级揭晓：短促有力的 back.out 阻尼，用于成绩徽章出现的一瞬。
 */
export function revealGrade(
  target: RevealTarget,
  delay = 0,
): gsap.core.Tween | undefined {
  const els = toElements(target);
  if (els.length === 0) return undefined;
  if (prefersReducedMotion()) return undefined;
  return gsap.fromTo(
    els,
    { opacity: 0, scale: 0.86, filter: 'blur(5px)' },
    {
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
      duration: 0.5,
      delay,
      ease: 'back.out(1.6)',
      clearProps: 'filter,transform',
      overwrite: 'auto',
    },
  );
}
