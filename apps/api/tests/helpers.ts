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
