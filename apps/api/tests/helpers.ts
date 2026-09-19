import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 在导入任何 src 模块前把数据目录指向临时位置（env 在 import 时读取） */
export function useTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-api-test-'));
  process.env.SR_DATA_DIR = dir;
  process.env.SR_STORAGE_DIR = path.join(dir, 'storage');
  return dir;
}

/** 最小 db 形状，避免 helpers 顶层引入 src 模块（会抢在 env 设置之前） */
interface MinimalDb {
  prepare: (sql: string) => { run: (...args: unknown[]) => unknown };
}

/** 预置一个未使用的一次性接洽码，返回该码（测试提单用） */
export function insertContactKey(db: MinimalDb, code: string): string {
  db.prepare(
    `INSERT INTO contact_key (id, code, created_by, created_at, status) VALUES (?, ?, 'usr-xingchen', ?, 'unused')`,
  ).run(`ckey_${code}`, code, new Date().toISOString());
  return code;
}
