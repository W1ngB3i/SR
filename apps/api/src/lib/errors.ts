import { BizCode } from '@sr/shared';

/** 业务错误：携带 HTTP 状态与稳定业务码，由统一错误中间件转为 envelope */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(code: string, message: string, details?: Record<string, string[]>) {
    return new ApiError(400, code, message, details ?? null);
  }

  static unauthorized(message = '未登录或登录已过期') {
    return new ApiError(401, BizCode.Unauthorized, message);
  }

  static forbidden(message = '没有执行该操作的权限') {
    return new ApiError(403, BizCode.PermissionDenied, message);
  }

  static notFound(code: string, message: string) {
    return new ApiError(404, code, message);
  }

  static conflict(code: string, message: string) {
    return new ApiError(409, code, message);
  }
}
