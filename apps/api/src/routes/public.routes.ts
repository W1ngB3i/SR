import { Router } from 'express';
import {
  appealCreateSchema,
  lookupSchema,
  submitTicketSchema,
  supplementSchema,
  zodFieldErrors,
} from '@sr/shared';
import { sendOk } from '../middleware/errorHandler.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { ApiError } from '../lib/errors.js';
import { createAppeal } from '../services/appeal.js';
import { listPublicAnnouncements } from '../services/announcement.js';
import { getRulesBundle } from '../services/rule.js';
import {
  createTicket,
  listPublished,
  lookupTicket,
  provideSupplement,
} from '../services/ticket.js';
import { buildUploadMiddleware, cleanupFiles } from '../services/storage.js';

/** 公开只读路由（挂载 /api/v1/public） */
export const publicRouter = Router();

/** 申请人写路由（挂载 /api/v1，无需账号） */
export const applicantRouter = Router();

/** 规则快照：驱动申请表单与规则页，公开只读 */
publicRouter.get('/rules', (_req, res, next) => {
  try {
    sendOk(res, getRulesBundle());
  } catch (err) {
    next(err);
  }
});

/** 公示页公告 */
publicRouter.get('/announcements', (_req, res, next) => {
  try {
    sendOk(res, listPublicAnnouncements());
  } catch (err) {
    next(err);
  }
});

/** 公示列表：只返回脱敏字段 */
publicRouter.get('/published', (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.page_size ?? 10) || 10));
    sendOk(
      res,
      listPublished({
        department_id: req.query.department_id ? String(req.query.department_id) : undefined,
        keyword: req.query.keyword ? String(req.query.keyword).trim() : undefined,
        page,
        pageSize,
      }),
    );
  } catch (err) {
    next(err);
  }
});

/** 进度查询：圈名 + 查询码，防止遍历他人工单 */
publicRouter.get('/tickets/lookup', (req, res, next) => {
  try {
    const parsed = lookupSchema.safeParse({
      circle_name: String(req.query.circle_name ?? '').trim(),
      query_code: String(req.query.query_code ?? '').trim(),
    });
    if (!parsed.success) {
      throw ApiError.notFound('INVALID_QUERY_CODE', '圈名与查询码不匹配，请核对后重试');
    }
    sendOk(res, lookupTicket(parsed.data.circle_name, parsed.data.query_code));
  } catch (err) {
    next(err);
  }
});

/** 提交工单：multipart（表单字段 ticket 为 JSON，files 为证据），带频率限制与冷却期 */
applicantRouter.post(
  '/tickets',
  rateLimit({ windowMs: 3_600_000, max: 12 }),
  (req, res, next) => {
    const upload = buildUploadMiddleware().array('files', 6);
    upload(req, res, (err) => {
      const files = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[];
      if (err) {
        cleanupFiles(files);
        next(err);
        return;
      }
      try {
        const raw = req.body.ticket;
        const parsed = submitTicketSchema.safeParse(
          typeof raw === 'string' && raw ? JSON.parse(raw) : null,
        );
        if (!parsed.success) {
          cleanupFiles(files);
          if (parsed.error.issues.length > 0) {
            throw ApiError.badRequest('FIELD_REQUIRED', '表单字段校验失败', zodFieldErrors(parsed.error));
          }
          throw ApiError.badRequest('INVALID_INPUT', '工单字段缺失');
        }
        sendOk(res, createTicket(parsed.data, files), 201);
      } catch (err) {
        cleanupFiles(files);
        next(err);
      }
    });
  },
);

/** 申请人申诉：凭圈名 + 查询码校验身份，落库为工单子记录 */
applicantRouter.post('/tickets/:id/appeals', rateLimit({ windowMs: 3_600_000, max: 6 }), (req, res, next) => {
  try {
    const id = req.params['id'];
    if (!id) throw ApiError.badRequest('FIELD_REQUIRED', '缺少工单 ID');
    const parsed = appealCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw ApiError.badRequest('FIELD_REQUIRED', '申诉字段校验失败', zodFieldErrors(parsed.error));
    }
    sendOk(res, createAppeal(id, parsed.data, { reason: parsed.data.reason, contact: parsed.data.contact }), 201);
  } catch (err) {
    next(err);
  }
});

/** 申请人补充材料：multipart（identity 为 JSON，files 为补充材料） */
applicantRouter.post('/tickets/:id/supplement', (req, res, next) => {
  const upload = buildUploadMiddleware().array('files', 6);
  upload(req, res, (err) => {
    const files = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[];
    if (err) {
      cleanupFiles(files);
      next(err);
      return;
    }
    try {
      const raw = req.body.identity;
      const parsed = supplementSchema.safeParse(
        typeof raw === 'string' && raw ? JSON.parse(raw) : null,
      );
      if (!parsed.success) {
        throw ApiError.notFound('INVALID_QUERY_CODE', '圈名与查询码不匹配，无法补充材料');
      }
      sendOk(res, provideSupplement(req.params.id, parsed.data, parsed.data.note ?? '', files));
    } catch (err) {
      cleanupFiles(files);
      next(err);
    }
  });
});
