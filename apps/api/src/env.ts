import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 本地开发数据目录（数据库文件、随机密钥） */
export const DATA_DIR = process.env.SR_DATA_DIR ?? path.join(API_ROOT, 'data');

/** 证据文件存储根目录（生产环境对接 S3 兼容对象存储，此处为本地落盘） */
export const STORAGE_DIR = process.env.SR_STORAGE_DIR ?? path.join(API_ROOT, 'storage');

export const PORT = Number(process.env.PORT ?? 8787);

export const DB_PATH = path.join(DATA_DIR, 'sr-review.db');

/**
 * JWT 密钥：优先读环境变量；
 * 本地零配置场景下生成随机密钥并持久化到数据目录。
 */
export const JWT_SECRET: string = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(DATA_DIR, 'jwt-secret');
  if (fs.existsSync(secretFile)) {
    const stored = fs.readFileSync(secretFile, 'utf8').trim();
    if (stored) return stored;
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(secretFile, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
})();

export function ensureDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}
