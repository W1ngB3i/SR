import { Router } from 'express';
import { API_PREFIX } from '@sr/shared';
import { authRouter } from './auth.routes.js';
import { applicantRouter, publicRouter } from './public.routes.js';
import { ticketRouter } from './ticket.routes.js';
import { adminRouter } from './admin.routes.js';
import { contactKeyRouter } from './key.routes.js';
import { fileRouter } from './file.routes.js';
import { robotRouter } from './robot.routes.js';

export const apiRouter = Router();

apiRouter.use(`${API_PREFIX}/auth`, authRouter);
apiRouter.use(`${API_PREFIX}/public`, publicRouter);
// 申请人提交（POST /tickets）与补充材料走公开通道，置于需登录的工单路由之前
apiRouter.use(`${API_PREFIX}`, applicantRouter);
apiRouter.use(`${API_PREFIX}/tickets`, ticketRouter);
apiRouter.use(`${API_PREFIX}/contact-keys`, contactKeyRouter);
apiRouter.use(`${API_PREFIX}/admin`, adminRouter);
apiRouter.use(`${API_PREFIX}/files`, fileRouter);
// QQ 官方开放平台回调：按平台约定暴露在 /api/robot 下，不带版本号
apiRouter.use('/api/robot', robotRouter);
