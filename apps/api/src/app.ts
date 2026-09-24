import express from 'express';
import cors from 'cors';
import { requestContext } from './middleware/context.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  // 先挂载 request_id：请求体解析失败时响应也要能带上链路标识
  app.use(requestContext);
  // 保留原始报文：QQ 机器人回调验签需要按字节校验签名
  // strict:false —— 系统配置接口（PUT /admin/config/:key）允许用裸布尔 / 裸数字作为请求体
  app.use(
    express.json({
      limit: '1mb',
      strict: false,
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  // 健康检查：供反向代理与监控探活，无需鉴权
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
  });

  app.use(apiRouter);

  // 统一 404 envelope
  app.use((_req, res) => {
    res.status(404).json({
      data: null,
      error: { code: 'ROUTE_NOT_FOUND', message: '接口不存在' },
      request_id: String(res.locals.requestId ?? ''),
    });
  });

  app.use(errorHandler);
  return app;
}
