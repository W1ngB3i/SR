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
  // 生产环境必须显式注入密钥，避免密钥随数据目录漂移或被遗漏轮换
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须通过环境变量 JWT_SECRET 显式注入 JWT 密钥');
  }
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

// ---------------------------------------------------------------------------
// QQ 官方开放平台机器人
// ---------------------------------------------------------------------------

/** 机器人 AppID（q.qq.com 创建应用后获得） */
export const QQ_BOT_APPID = process.env.QQ_BOT_APPID ?? '';
/** 机器人 Secret：既用于换取 AccessToken，也用于 Webhook 回调验签与 Ed25519 应答 */
export const QQ_BOT_SECRET = process.env.QQ_BOT_SECRET ?? '';
/** 沙箱环境开关：true 时开放接口域名切换到 sandbox.api.sgroup.qq.com */
export const QQ_BOT_SANDBOX = process.env.QQ_BOT_SANDBOX === 'true';

/** 申请人端站点地址，用于拼接机器人按钮链接 */
export const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
/** 管理端站点地址，用于拼接审核工作台按钮链接 */
export const ADMIN_SITE_URL = (process.env.ADMIN_SITE_URL ?? 'http://localhost:5174').replace(/\/+$/, '');

/**
 * 机器人是否具备真实投递能力。
 * v2 开放接口只需 AppID + Secret（Token 鉴权已由平台弃用），二者齐备即可投递，否则只记日志待重发。
 */
export function isRobotConfigured(): boolean {
  return Boolean(QQ_BOT_APPID && QQ_BOT_SECRET);
}
