import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/** 为每个请求生成 request_id，便于日志串联 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  req.requestId = crypto.randomUUID();
  res.locals.requestId = req.requestId;
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
