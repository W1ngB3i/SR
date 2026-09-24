import { Router, type Request } from 'express';
import {
  announcementSchema,
  appealHandleSchema,
  departmentSchema,
  modeSchema,
  robotIdentityCreateSchema,
  robotIdentityUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
  passwordResetSchema,
  zodFieldErrors,
} from '@sr/shared';
import { authRequired, requireRoles, MANAGER_ROLES, PLATFORM_ROLES } from '../middleware/auth.js';
import { sendOk } from '../middleware/errorHandler.js';
import { ApiError } from '../lib/errors.js';
import { handleAppeal, listAppeals } from '../services/appeal.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAllAnnouncements,
  updateAnnouncement,
} from '../services/announcement.js';
import { listAuditLogs } from '../services/audit.js';
import { getAllConfig, setConfig, type ConfigKey, type ConfigMap } from '../services/config.js';
import { listAllContactKeys } from '../services/key.js';
import {
  createIdentity,
  deleteIdentity,
  listIdentities,
  listMessages,
  resendMessage,
  robotSummary,
  updateIdentity,
} from '../services/robot.js';
import { robotPlatformInfo } from '../services/qq.js';
import {
  createDepartment,
  createMode,
  deleteDepartment,
  deleteMode,
  listDepartments,
  updateDepartment,
  updateMode,
} from '../services/rule.js';
import {
  createUser,
  listUsers,
  resetPassword,
  updateUser,
} from '../services/user.js';
import { getStats } from '../services/ticket.js';

export const adminRouter = Router();
adminRouter.use(authRequired);

function actor(req: { user?: { id: string; name: string } }) {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, name: req.user.name };
}

function idParam(req: Request): string {
  const id = req.params['id'];
  if (!id) throw ApiError.badRequest('FIELD_REQUIRED', '缺少资源 ID');
  return id;
}

// ---------------------------------------------------------------------------
// 规则配置中心：审核标准的唯一真源
// ---------------------------------------------------------------------------

adminRouter.get('/departments', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    sendOk(res, listDepartments(true));
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/departments', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = departmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('FIELD_REQUIRED', '部门字段校验失败', zodFieldErrors(parsed.error));
    }
    sendOk(res, createDepartment(parsed.data, actor(req)), 201);
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/departments/:id', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const patch: Record<string, unknown> = req.body ?? {};
    if (patch.name !== undefined || patch.tier !== undefined || patch.contact !== undefined) {
      const parsed = departmentSchema.safeParse({ ...patch });
      if (!parsed.success) {
        throw ApiError.badRequest('FIELD_REQUIRED', '部门字段校验失败', zodFieldErrors(parsed.error));
      }
    }
    sendOk(res, updateDepartment(idParam(req), patch as never, actor(req)));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/departments/:id', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    deleteDepartment(idParam(req), actor(req));
    sendOk(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/modes', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = modeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('FIELD_REQUIRED', '模式字段校验失败', zodFieldErrors(parsed.error));
    }
    sendOk(res, createMode(parsed.data, actor(req)), 201);
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/modes/:id', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    sendOk(res, updateMode(idParam(req), req.body ?? {}, actor(req)));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/modes/:id', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    deleteMode(idParam(req), actor(req));
    sendOk(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 系统配置
// ---------------------------------------------------------------------------

adminRouter.get('/config', requireRoles(...PLATFORM_ROLES), (_req, res, next) => {
  try {
    sendOk(res, getAllConfig());
  } catch (err) {
    next(err);
  }
});

const CONFIG_VALUE_VALIDATORS: {
  [K in ConfigKey]: (v: unknown) => ConfigMap[K] | null;
} = {
  feedback_contacts: (v) => {
    const o = v as ConfigMap['feedback_contacts'];
    if (
      o &&
      typeof o === 'object' &&
      o.chief?.name && o.chief?.qq &&
      o.deputy?.name && o.deputy?.qq
    ) {
      return o;
    }
    return null;
  },
  submission_cooldown_hours: (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 720 ? (n as number) : null;
  },
  reviewer_max_concurrent: (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 50 ? (n as number) : null;
  },
  upload_limits: (v) => {
    const o = v as ConfigMap['upload_limits'];
    if (
      o &&
      typeof o === 'object' &&
      Number.isFinite(o.max_file_mb) && o.max_file_mb > 0 && o.max_file_mb <= 2048 &&
      Number.isInteger(o.max_files) && o.max_files >= 1 && o.max_files <= 20 &&
      Array.isArray(o.image_ext) && Array.isArray(o.video_ext)
    ) {
      return o;
    }
    return null;
  },
  robot_require_bound_key: (v) => (typeof v === 'boolean' ? v : null),
};

adminRouter.put('/config/:key', requireRoles(...PLATFORM_ROLES), (req, res, next) => {
  try {
    const key = req.params.key as ConfigKey;
    if (!Object.prototype.hasOwnProperty.call(CONFIG_VALUE_VALIDATORS, key)) {
      throw ApiError.notFound('RESOURCE_NOT_FOUND', `未知配置项：${key}`);
    }
    const validate = CONFIG_VALUE_VALIDATORS[key];
    const value = validate(req.body);
    if (value === null) {
      throw ApiError.badRequest('INVALID_INPUT', '配置值格式不合法', { value: ['请检查格式'] });
    }
    setConfig(key, value, actor(req));
    sendOk(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 审计日志（只读，只增不删）
// ---------------------------------------------------------------------------

adminRouter.get('/audit-logs', requireRoles(...PLATFORM_ROLES), (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20) || 20));
    sendOk(
      res,
      listAuditLogs({
        action: req.query.action ? String(req.query.action) : undefined,
        resource: req.query.resource ? String(req.query.resource) : undefined,
        page,
        pageSize,
      }),
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 人员管理（审核员名单由总管/副总管维护；系统管理员负责平台账号）
// ---------------------------------------------------------------------------

adminRouter.get('/users', requireRoles(...PLATFORM_ROLES), (_req, res, next) => {
  try {
    sendOk(res, listUsers());
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users', requireRoles(...PLATFORM_ROLES), (req, res, next) => {
  try {
    const parsed = userCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('FIELD_REQUIRED', '账号字段校验失败', zodFieldErrors(parsed.error));
    }
    sendOk(res, createUser({ ...parsed.data, operator: actor(req) }), 201);
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/users/:id', requireRoles(...PLATFORM_ROLES), (req, res, next) => {
  try {
    const parsed = userUpdateSchema.parse(req.body ?? {});
    if (idParam(req) === req.user!.id && parsed.status === 'disabled') {
      throw ApiError.badRequest('INVALID_INPUT', '不能停用自己的账号');
    }
    sendOk(res, updateUser(idParam(req), parsed, actor(req)));
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users/:id/reset-password', requireRoles(...PLATFORM_ROLES), (req, res, next) => {
  try {
    const parsed = passwordResetSchema.parse(req.body);
    resetPassword(idParam(req), parsed.password, actor(req));
    sendOk(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 公告管理
// ---------------------------------------------------------------------------

adminRouter.get('/announcements', requireRoles(...MANAGER_ROLES), (_req, res, next) => {
  try {
    sendOk(res, listAllAnnouncements());
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/announcements', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('FIELD_REQUIRED', '公告字段校验失败', zodFieldErrors(parsed.error));
    }
    sendOk(res, createAnnouncement(parsed.data, actor(req)), 201);
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/announcements/:id', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    sendOk(res, updateAnnouncement(idParam(req), req.body ?? {}, actor(req)));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/announcements/:id', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    deleteAnnouncement(idParam(req), actor(req));
    sendOk(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 申诉处理（总管/副总管）
// ---------------------------------------------------------------------------

adminRouter.get('/appeals', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20) || 20));
    sendOk(res, listAppeals({ status: req.query.status ? String(req.query.status) : undefined, page, pageSize }));
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/appeals/:id', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = appealHandleSchema.parse(req.body ?? {});
    const u = req.user;
    if (!u) throw ApiError.unauthorized();
    sendOk(res, handleAppeal(idParam(req), parsed.action, parsed.note, { id: u.id, name: u.name, role: u.role }));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 机器人管理（总管/副总管：身份绑定 / 接洽码绑定状态 / 消息日志）
// ---------------------------------------------------------------------------

adminRouter.get('/robot-status', requireRoles(...MANAGER_ROLES), (_req, res, next) => {
  try {
    sendOk(res, robotSummary(robotPlatformInfo()));
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/robot-identities', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20) || 20));
    sendOk(
      res,
      listIdentities({
        keyword: req.query.keyword ? String(req.query.keyword) : undefined,
        role: req.query.role ? String(req.query.role) : undefined,
        dept_id: req.query.dept_id ? String(req.query.dept_id) : undefined,
        page,
        pageSize,
      }),
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/robot-identities', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = robotIdentityCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('FIELD_REQUIRED', '绑定信息校验失败', zodFieldErrors(parsed.error));
    }
    sendOk(res, createIdentity(parsed.data, actor(req)), 201);
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/robot-identities/:openid', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = robotIdentityUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw ApiError.badRequest('FIELD_REQUIRED', '绑定信息校验失败', zodFieldErrors(parsed.error));
    }
    sendOk(res, updateIdentity(decodeURIComponent(req.params['openid'] ?? ''), parsed.data, actor(req)));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/robot-identities/:openid', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    deleteIdentity(decodeURIComponent(req.params['openid'] ?? ''), actor(req));
    sendOk(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/robot-messages', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20) || 20));
    sendOk(
      res,
      listMessages({
        status: req.query.status ? String(req.query.status) : undefined,
        kind: req.query.kind ? String(req.query.kind) : undefined,
        page,
        pageSize,
      }),
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/robot-messages/:id/resend', requireRoles(...MANAGER_ROLES), async (req, res, next) => {
  try {
    sendOk(res, await resendMessage(idParam(req), actor(req)));
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/contact-keys', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const bound = req.query.bound;
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20) || 20));
    sendOk(
      res,
      listAllContactKeys({
        bound: bound === 'bound' || bound === 'unbound' ? bound : undefined,
        page,
        pageSize,
      }),
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 概览统计
// ---------------------------------------------------------------------------

adminRouter.get('/stats', requireRoles(...PLATFORM_ROLES), (_req, res, next) => {
  try {
    sendOk(res, getStats());
  } catch (err) {
    next(err);
  }
});
