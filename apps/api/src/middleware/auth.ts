import type { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';
import { BizCode, type StaffRole } from '@sr/shared';
import { JWT_SECRET } from '../env.js';
import { ApiError } from '../lib/errors.js';
import { getStaffUserById } from '../services/user.js';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const secretKey = new TextEncoder().encode(JWT_SECRET);

/** 校验 Bearer Token 并加载在职账号 */
export async function authRequired(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized();
    }
    const token = header.slice('Bearer '.length);
    const { payload } = await jwtVerify(token, secretKey);
    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    const user = getStaffUserById(userId);
    if (!user || user.status !== 'active') {
      throw ApiError.unauthorized('账号不存在或已被停用');
    }
    req.user = { id: user.id, username: user.username, name: user.name, role: user.role };
    next();
  } catch (err) {
    if (err instanceof ApiError) {
      next(err);
      return;
    }
    next(ApiError.unauthorized());
  }
}

/** 角色权限：资源 + 动作在中间件层强校验，前端隐藏按钮不等于后端放行 */
export function requireRoles(...allowed: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!allowed.includes(req.user.role)) {
      next(ApiError.forbidden());
      return;
    }
    next();
  };
}

/** 审核相关人员（可进入工单域） */
export const REVIEW_ROLES: StaffRole[] = ['reviewer', 'deputy', 'chief'];
/** 管理人员（复核、公示、规则、指派） */
export const MANAGER_ROLES: StaffRole[] = ['deputy', 'chief'];
/** 平台管理（账号、配置、日志） */
export const PLATFORM_ROLES: StaffRole[] = ['deputy', 'chief', 'admin'];

export function isManager(role: StaffRole): boolean {
  return role === 'chief' || role === 'deputy';
}
