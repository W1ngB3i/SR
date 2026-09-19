import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { BizCode, zodFieldErrors } from '@sr/shared';
import { ApiError } from '../lib/errors.js';

/** 成功响应 envelope */
export function sendOk<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data, error: null, request_id: res.locals.requestId ?? '' });
}

/** 统一错误处理：业务码 + request_id，不向前端暴露堆栈 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId ?? '';
  if (err instanceof ApiError) {
    res.status(err.status).json({
      data: null,
      error: { code: err.code, message: err.message, details: err.details },
      request_id: requestId,
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      data: null,
      error: {
        code: BizCode.InvalidInput,
        message: '请求参数不合法',
        details: zodFieldErrors(err),
      },
      request_id: requestId,
    });
    return;
  }
  // 数据库约束冲突（如外键限制删除）
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    res.status(409).json({
      data: null,
      error: { code: BizCode.ResourceConflict, message: '该记录已被业务数据引用，无法删除' },
      request_id: requestId,
    });
    return;
  }
  console.error(`[api][${requestId}] unhandled error:`, err);
  res.status(500).json({
    data: null,
    error: { code: BizCode.InternalError, message: '服务内部错误，请稍后重试' },
    request_id: requestId,
  });
}
