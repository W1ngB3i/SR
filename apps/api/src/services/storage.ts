import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import multer from 'multer';
import { SignJWT, jwtVerify } from 'jose';
import { BizCode, type AttachmentDTO } from '@sr/shared';
import { STORAGE_DIR, JWT_SECRET } from '../env.js';
import { ApiError } from '../lib/errors.js';
import { newId, nowIso } from '../lib/ids.js';
import { getDb } from '../db/index.js';
import { getConfig } from './config.js';

const secretKey = new TextEncoder().encode(JWT_SECRET);

/** 判定附件类型：图片 / 视频 / 其他 */
export function detectKind(filename: string): 'image' | 'video' | 'other' {
  const ext = path.extname(filename).toLowerCase();
  const limits = getConfig('upload_limits');
  if (limits.image_ext.includes(ext)) return 'image';
  if (limits.video_ext.includes(ext)) return 'video';
  return 'other';
}

/** 白名单 + 大小限制通过后再落盘（multer 磁盘存储） */
export function buildUploadMiddleware() {
  const limits = getConfig('upload_limits');
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(STORAGE_DIR, new Date().toISOString().slice(0, 7));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${newId('file')}${ext}`);
      },
    }),
    limits: { fileSize: limits.max_file_mb * 1024 * 1024, files: limits.max_files },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const { image_ext, video_ext } = getConfig('upload_limits');
      if (!image_ext.includes(ext) && !video_ext.includes(ext)) {
        cb(new ApiError(400, BizCode.UploadRejected, `不支持的文件类型 ${ext}，仅接受图片与视频`));
        return;
      }
      cb(null, true);
    },
  });
}

/** 删除误传的落盘文件（校验失败回滚用） */
export function cleanupFiles(files: Express.Multer.File[]): void {
  for (const file of files) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* 忽略清理失败 */
    }
  }
}

export function saveAttachmentMeta(
  ticketId: string,
  file: Express.Multer.File,
): AttachmentDTO {
  const id = newId('att');
  const kind = detectKind(file.originalname);
  const relativeKey = path.relative(STORAGE_DIR, file.path).replaceAll('\\', '/');
  getDb()
    .prepare(
      `INSERT INTO attachment (id, ticket_id, kind, filename, storage_key, size, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, ticketId, kind, file.originalname, relativeKey, file.size, nowIso());
  return {
    id,
    ticket_id: ticketId,
    kind,
    filename: file.originalname,
    size: file.size,
    uploaded_at: nowIso(),
    url: '',
  };
}

interface AttachmentRow {
  id: string;
  ticket_id: string;
  kind: 'image' | 'video' | 'other';
  filename: string;
  storage_key: string;
  size: number;
  uploaded_at: string;
}

function getAttachmentRow(id: string): AttachmentRow | null {
  return (getDb().prepare('SELECT * FROM attachment WHERE id = ?').get(id) as AttachmentRow | undefined) ?? null;
}

export function attachmentPhysicalPath(id: string): string | null {
  const row = getAttachmentRow(id);
  if (!row) return null;
  const p = path.resolve(STORAGE_DIR, row.storage_key);
  if (!p.startsWith(path.resolve(STORAGE_DIR))) return null; // 防目录穿越
  return fs.existsSync(p) ? p : null;
}

export function attachmentFilename(id: string): string | null {
  return getAttachmentRow(id)?.filename ?? null;
}

/** 签发限时访问地址（私有存储，签名 URL 且限时有效，不开放公开读取） */
export async function issueSignedUrl(attachmentId: string): Promise<string> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(attachmentId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secretKey);
  return `/api/v1/files/${attachmentId}?token=${token}`;
}

export async function verifyStreamToken(
  attachmentId: string,
  token: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload.sub === attachmentId && payload.exp !== undefined && payload.exp > Date.now() / 1000 - 5;
  } catch {
    return false;
  }
}

/** 为工单详情中的附件生成带签名的 DTO */
export async function attachmentsForTicket(ticketId: string): Promise<AttachmentDTO[]> {
  const rows = getDb()
    .prepare('SELECT * FROM attachment WHERE ticket_id = ? ORDER BY uploaded_at ASC')
    .all(ticketId) as AttachmentRow[];
  const out: AttachmentDTO[] = [];
  for (const row of rows) {
    out.push({
      id: row.id,
      ticket_id: row.ticket_id,
      kind: row.kind,
      filename: row.filename,
      size: row.size,
      uploaded_at: row.uploaded_at,
      url: await issueSignedUrl(row.id),
    });
  }
  return out;
}

/** 生成随机下载校验串，供种子数据使用 */
export function randomTokenSeed(): string {
  return crypto.randomBytes(8).toString('hex');
}
