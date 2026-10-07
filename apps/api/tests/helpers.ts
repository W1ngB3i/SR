import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// 仅取类型：`import type` 编译后整体擦除，不会执行 src 模块，因此不影响下面 env 的设置时机
import type { DB } from '../src/db/index.js';

/** 在导入任何 src 模块前把数据目录指向临时位置（env 在 import 时读取） */
export function useTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-api-test-'));
  process.env.SR_DATA_DIR = dir;
  process.env.SR_STORAGE_DIR = path.join(dir, 'storage');
  return dir;
}

/** 预置一个未使用的一次性接洽码，返回该码（测试提单用） */
export function insertContactKey(db: DB, code: string): string {
  db.prepare(
    `INSERT INTO contact_key (id, code, created_by, created_at, status) VALUES (?, ?, 'usr-xingchen', ?, 'unused')`,
  ).run(`ckey_${code}`, code, new Date().toISOString());
  return code;
}
