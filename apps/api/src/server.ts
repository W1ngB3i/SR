import { createApp } from './app.js';
import { IS_PRODUCTION, PORT, ensureDirs } from './env.js';
import { getDb, closeDb } from './db/index.js';
import { seedBase, seedDemoTickets } from './db/seed.js';
import { pruneExpiredSessions } from './services/robotSession.js';

function main() {
  ensureDirs();
  const db = getDb();
  // 首次启动自动初始化基础数据（账号 / 部门 / 模式 / 配置 / 公告），零配置本地开发
  const userCount = (db.prepare('SELECT COUNT(*) AS c FROM "user"').get() as { c: number }).c;
  if (userCount === 0) {
    console.log('[api] 首次启动，正在初始化基础数据…');
    seedBase(true);
    // 演示工单只供本地开发观察各状态页面，生产库保持干净
    if (!IS_PRODUCTION) {
      console.log('[api] 非生产环境，继续灌入演示工单…');
      seedDemoTickets(true);
    }
  }

  // 启动时清一次超时的机器人申请草稿（30 分钟未续期即作废），此后由会话读写时惰性清理
  const pruned = pruneExpiredSessions();
  if (pruned > 0) console.log(`[api] 已清理 ${pruned} 条超时的机器人申请会话`);

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
