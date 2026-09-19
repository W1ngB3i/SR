import { createApp } from './app.js';
import { PORT, ensureDirs } from './env.js';
import { getDb, closeDb } from './db/index.js';
import { seedDatabase } from './db/seed.js';

function main() {
  ensureDirs();
  const db = getDb();
  // 首次启动自动灌入初始规则与演示数据（零配置本地开发）
  const userCount = (db.prepare('SELECT COUNT(*) AS c FROM "user"').get() as { c: number }).c;
  if (userCount === 0) {
    console.log('[api] 首次启动，正在初始化种子数据…');
    seedDatabase(true);
  }

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`[api] SR 审核工单系统 API 已启动`);
    console.log(`[api] 地址: http://localhost:${PORT}`);
    console.log(`[api] 公示页接口示例: http://localhost:${PORT}/api/v1/public/published`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      server.close(() => {
        closeDb();
        process.exit(0);
      });
    });
  }
}

main();
