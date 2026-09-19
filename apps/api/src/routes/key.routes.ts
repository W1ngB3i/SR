import { Router, type Request } from 'express';
import { authRequired, requireRoles, REVIEW_ROLES } from '../middleware/auth.js';
import { sendOk } from '../middleware/errorHandler.js';
import { ApiError } from '../lib/errors.js';
import { generateContactKey, listMyContactKeys } from '../services/key.js';

/** 接洽码路由（挂载 /api/v1/contact-keys）：审核相关人员可生成与查看自己的码 */
export const contactKeyRouter = Router();
contactKeyRouter.use(authRequired);

function actor(req: Request): { id: string; name: string; role: 'reviewer' | 'deputy' | 'chief' | 'admin' } {
  const u = req.user;
  if (!u) throw ApiError.unauthorized();
  return { id: u.id, name: u.name, role: u.role };
}

/** 我生成的接洽码列表 */
contactKeyRouter.get('/', requireRoles(...REVIEW_ROLES), (req, res, next) => {
  try {
    sendOk(res, listMyContactKeys(actor(req).id));
  } catch (err) {
    next(err);
  }
});

/** 生成一个新接洽码（一次性使用） */
contactKeyRouter.post('/', requireRoles(...REVIEW_ROLES), (req, res, next) => {
  try {
    sendOk(res, generateContactKey(actor(req)), 201);
  } catch (err) {
    next(err);
  }
});
