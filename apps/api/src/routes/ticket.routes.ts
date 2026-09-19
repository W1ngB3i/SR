import { Router, type Request } from 'express';
import {
  assignSchema,
  releaseSchema,
  receiptSchema,
  reviewSchema,
  supplementRequestSchema,
  ticketInfoUpdateSchema,
  ticketStatusSchema,
  zodFieldErrors,
} from '@sr/shared';
import { authRequired, requireRoles, REVIEW_ROLES, MANAGER_ROLES, isManager } from '../middleware/auth.js';
import { sendOk } from '../middleware/errorHandler.js';
import { ApiError } from '../lib/errors.js';
import { attachmentsForTicket } from '../services/storage.js';
import { listAssignableUsers } from '../services/user.js';
import {
  assignTicket,
  claimTicket,
  deleteTicket,
  getTicketDetail,
  listTickets,
  publishTicket,
  releaseTicket,
  requestSupplement,
  reviewTicket,
  saveReceipt,
  togglePin,
  unpublishTicket,
  updateTicketInfo,
} from '../services/ticket.js';

export const ticketRouter = Router();
ticketRouter.use(authRequired);

function actor(req: Request): { id: string; name: string; role: 'reviewer' | 'deputy' | 'chief' | 'admin' } {
  const u = req.user;
  if (!u) throw ApiError.unauthorized();
  return { id: u.id, name: u.name, role: u.role };
}

function idParam(req: Request): string {
  const id = req.params['id'];
  if (!id) throw ApiError.badRequest('FIELD_REQUIRED', '缺少工单 ID');
  return id;
}

/** 工单池 / 后台查询（审核员及以上） */
ticketRouter.get('/', requireRoles(...REVIEW_ROLES), (req, res, next) => {
  try {
    const status = String(req.query.status ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of status) {
      if (!ticketStatusSchema.safeParse(s).success) {
        throw ApiError.badRequest('INVALID_INPUT', `未知状态：${s}`);
      }
    }
    const viewer = req.user!;
    if (!viewer) throw ApiError.unauthorized();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.page_size ?? 12) || 12));
    sendOk(
      res,
      listTickets(
        {
          status: status.length ? status : undefined,
          department_id: req.query.department_id ? String(req.query.department_id) : undefined,
          mode_id: req.query.mode_id ? String(req.query.mode_id) : undefined,
          module: req.query.module ? String(req.query.module) : undefined,
          intention: req.query.intention ? String(req.query.intention) : undefined,
          keyword: req.query.keyword ? String(req.query.keyword).trim() : undefined,
          mine: req.query.mine === '1' || req.query.mine === 'true',
          page,
          pageSize,
        },
        { id: viewer.id, role: viewer.role },
      ),
    );
  } catch (err) {
    next(err);
  }
});

/** 可指派的审核人员（指派弹窗用） */
ticketRouter.get('/assignables', requireRoles(...REVIEW_ROLES), (_req, res, next) => {
  try {
    sendOk(res, listAssignableUsers());
  } catch (err) {
    next(err);
  }
});

/** 工单详情：含时间线、回执与证据签名地址 */
ticketRouter.get('/:id', requireRoles(...REVIEW_ROLES), async (req, res, next) => {
  try {
    const detail = getTicketDetail(idParam(req), req.user!);
    detail.attachments = await attachmentsForTicket(idParam(req));
    sendOk(res, detail);
  } catch (err) {
    next(err);
  }
});

/** 接单：先到先得，数据库原子更新保证唯一 */
ticketRouter.post('/:id/claim', requireRoles(...REVIEW_ROLES), (req, res, next) => {
  try {
    sendOk(res, claimTicket(idParam(req), actor(req)));
  } catch (err) {
    next(err);
  }
});

/** 指派（总管） */
ticketRouter.post('/:id/assign', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = assignSchema.parse(req.body);
    sendOk(res, assignTicket(idParam(req), parsed.assignee_id, actor(req)));
  } catch (err) {
    next(err);
  }
});

/** 释放回公单池（总管） */
ticketRouter.post('/:id/release', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = releaseSchema.parse(req.body ?? {});
    sendOk(res, releaseTicket(idParam(req), parsed.reason, actor(req)));
  } catch (err) {
    next(err);
  }
});

/** 置顶优先（总管） */
ticketRouter.post('/:id/pin', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    sendOk(res, togglePin(idParam(req), actor(req)));
  } catch (err) {
    next(err);
  }
});

/** 退回申请人补充（负责审核员） */
ticketRouter.post('/:id/supplement-request', requireRoles(...REVIEW_ROLES), (req, res, next) => {
  try {
    const parsed = supplementRequestSchema.parse(req.body);
    sendOk(res, requestSupplement(idParam(req), parsed.reason, actor(req)));
  } catch (err) {
    next(err);
  }
});

/** 保存草稿 / 提交回执（负责审核员） */
ticketRouter.put('/:id/receipt', requireRoles(...REVIEW_ROLES), (req, res, next) => {
  try {
    const parsed = receiptSchema.parse(req.body ?? {});
    if (parsed.submit) {
      const missing: Record<string, string[]> = {};
      if (parsed.pass === null || parsed.pass === undefined) {
        missing.pass = ['请选择审核评价'];
      }
      if (Object.keys(missing).length > 0) {
        throw ApiError.badRequest('FIELD_REQUIRED', '回执字段不完整', missing);
      }
    }
    sendOk(
      res,
      saveReceipt(
        idParam(req),
        {
          pe_grade: parsed.pe_grade ?? null,
          pc_grade: parsed.pc_grade ?? null,
          pass: parsed.pass ?? null,
          target_department: parsed.target_department,
          comment: parsed.comment,
          submit: parsed.submit,
        },
        actor(req),
      ),
    );
  } catch (err) {
    next(err);
  }
});

/** 复核确认 / 退回（总管） */
ticketRouter.post('/:id/review', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = reviewSchema.parse(req.body);
    sendOk(res, reviewTicket(idParam(req), parsed.action, parsed.note, actor(req)));
  } catch (err) {
    next(err);
  }
});

/** 发布公示（总管，与复核确认等效的独立入口） */
ticketRouter.post('/:id/publish', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    sendOk(res, publishTicket(idParam(req), actor(req)));
  } catch (err) {
    next(err);
  }
});

/** 修订工单基础信息（总管/副总管全权） */
ticketRouter.put('/:id/info', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    const parsed = ticketInfoUpdateSchema.parse(req.body ?? {});
    sendOk(res, updateTicketInfo(idParam(req), parsed, actor(req)));
  } catch (err) {
    next(err);
  }
});

/** 撤销公示：已公示 → 已出结果（总管/副总管全权） */
ticketRouter.post('/:id/unpublish', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    sendOk(res, unpublishTicket(idParam(req), actor(req)));
  } catch (err) {
    next(err);
  }
});

/** 删除工单：级联清理回执、时间线与附件（总管/副总管全权，不可恢复） */
ticketRouter.delete('/:id', requireRoles(...MANAGER_ROLES), (req, res, next) => {
  try {
    sendOk(res, deleteTicket(idParam(req), actor(req)));
  } catch (err) {
    next(err);
  }
});

export { isManager };
