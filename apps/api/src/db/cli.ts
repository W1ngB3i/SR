import fs from 'node:fs';
import { DB_PATH, ensureDirs } from '../env.js';
import { closeDb, getDb } from './index.js';
import { seedDatabase } from './seed.js';

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
  console.log('[db:reset] 数据库已重建并完成种子灌入');
} else if (command === 'seed') {
  const force = process.argv.includes('--force');
  getDb();
  seedDatabase(force);
} else {
  console.log('用法：tsx src/db/cli.ts <reset|seed> [--force]');
  process.exit(1);
}
