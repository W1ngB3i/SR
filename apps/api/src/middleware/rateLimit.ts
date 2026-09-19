import type { NextFunction, Request, Response } from 'express';
import { BizCode } from '@sr/shared';
import { ApiError } from '../lib/errors.js';

interface Options {
  windowMs: number;
  max: number;
}

const buckets = new Map<string, number[]>();

/** 简单内存滑动窗口限流（单机部署足够，重启即清零） */
export function rateLimit({ windowMs, max }: Options) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = `${req.ip ?? 'unknown'}:${req.path}`;
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      next(new ApiError(429, BizCode.RateLimited, '请求过于频繁，请稍后再试'));
      return;
    }
    hits.push(now);
    buckets.set(key, hits);
    // 顺带清理过期桶，避免内存缓慢膨胀
    if (buckets.size > 5000) {
      for (const [k, times] of buckets) {
        if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
      }
    }
    next();
  };
}
