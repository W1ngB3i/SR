import { BizCode, type ApiErrorShape } from '@sr/shared';
import { readAuth } from '../auth/storage';

/** 业务错误：携带稳定错误码与字段级 details */
export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = 'ApiClientError';
    this.code = shape.code;
    this.details = shape.details ?? undefined;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: BodyInit;
  query?: Record<string, string | number | undefined>;
}

interface RawEnvelope<T> {
  data?: T;
  error: ApiErrorShape | null;
  request_id?: string;
}

/** token 过期 / 未登录事件：AuthContext 监听并清理会话 */
export const UNAUTHORIZED_EVENT = 'sr:unauthorized';

/** 统一请求入口：注入 JWT、解包 envelope、业务错误抛 ApiClientError */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  const auth = readAuth();
  if (auth) headers['Authorization'] = `Bearer ${auth.token}`;
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(url, { method: options.method ?? 'GET', headers, body: options.body });
  } catch {
    throw new ApiClientError({ code: BizCode.InternalError, message: '网络异常，请稍后重试' });
  }

  let envelope: RawEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as RawEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!res.ok || !envelope || envelope.error) {
    const shape: ApiErrorShape =
      envelope?.error ?? { code: BizCode.InternalError, message: `请求失败（HTTP ${res.status}）` };
    if (res.status === 401 && shape.code === BizCode.Unauthorized) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiClientError(shape);
  }

  return envelope.data as T;
}
