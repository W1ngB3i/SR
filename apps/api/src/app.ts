import express from 'express';
import cors from 'cors';
import { requestContext } from './middleware/context.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(requestContext);
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
