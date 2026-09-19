import fs from 'node:fs';
import { DB_PATH, ensureDirs } from '../env.js';
import { closeDb, getDb } from './index.js';
import { seedDatabase } from './seed.js';
import { syncCatalog } from './syncCatalog.js';

const command = process.argv[2];

if (command === 'reset') {
  closeDb();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${DB_PATH}${suffix}`;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  ensureDirs();
  getDb();
  seedDatabase(true);
} else if (command === 'seed') {
  const force = process.argv.includes('--force');
  getDb();
  seedDatabase(force);
} else if (command === 'sync-catalog') {
  // 目录迁移（幂等）：只动 department/mode，保留账号与工单；执行前请备份数据库文件
  getDb();
  syncCatalog();
} else {
  console.log('用法：tsx src/db/cli.ts <reset|seed|sync-catalog> [--force]');
  process.exit(1);
}
