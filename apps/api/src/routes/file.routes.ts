import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { BizCode } from '@sr/shared';
import { ApiError } from '../lib/errors.js';
import {
  attachmentFilename,
  attachmentPhysicalPath,
  verifyStreamToken,
} from '../services/storage.js';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
};

export const fileRouter = Router();

/** 证据文件流：签名 token 限时访问，视频支持 Range 断点续播 */
fileRouter.get('/:id', async (req, res, next) => {
  try {
    const token = String(req.query.token ?? '');
    const id = req.params.id;
    if (!token || !(await verifyStreamToken(id, token))) {
      throw new ApiError(401, BizCode.Unauthorized, '访问凭证无效或已过期');
    }
    const filePath = attachmentPhysicalPath(id);
    if (!filePath) {
      throw ApiError.notFound('RESOURCE_NOT_FOUND', '文件不存在或已被清理');
    }
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? 'application/octet-stream';
    const downloadName = attachmentFilename(id) ?? path.basename(filePath);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`);

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : stat.size - 1;
        if (Number.isNaN(start) || start >= stat.size || end < start) {
          res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
          res.end();
          return;
        }
        const safeEnd = Math.min(end, stat.size - 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${stat.size}`);
        res.setHeader('Content-Length', String(safeEnd - start + 1));
        fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
        return;
      }
    }
    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});
