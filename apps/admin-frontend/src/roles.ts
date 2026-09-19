import type { StaffRole } from '@sr/shared';

/** 可见工单池 / 可执行审核操作的角色（与后端 REVIEW_ROLES 对齐） */
export const REVIEW_ROLES: readonly StaffRole[] = ['reviewer', 'deputy', 'chief'];

/** 总管级：指派 / 释放 / 置顶 / 复核 / 规则与公告管理 */
export const MANAGER_ROLES: readonly StaffRole[] = ['deputy', 'chief'];

/** 平台级：人员 / 配置 / 审计 / 统计 */
export const PLATFORM_ROLES: readonly StaffRole[] = ['deputy', 'chief', 'admin'];

export function hasRole(role: StaffRole | undefined, allowed: readonly StaffRole[]): boolean {
  return !!role && allowed.includes(role);
}

export const canReview = (role: StaffRole | undefined) => hasRole(role, REVIEW_ROLES);
export const canManage = (role: StaffRole | undefined) => hasRole(role, MANAGER_ROLES);
export const canPlatform = (role: StaffRole | undefined) => hasRole(role, PLATFORM_ROLES);

/** 登录后的默认落点：审核角色进工单池，纯平台角色进仪表盘 */
export function homePathFor(role: StaffRole | undefined): string {
  return canReview(role) ? '/pool' : '/stats';
}
