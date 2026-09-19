import crypto from 'node:crypto';

/** 短随机 ID（base64url，12 位） */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

/** 查询码字母表：去除 0/1/I/L/O 等易混淆字符 */
const QUERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 生成 8 位查询码，与圈名组合作为申请人查询进度的凭证 */
export function genQueryCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const b of bytes) {
    code += QUERY_CODE_ALPHABET[b % QUERY_CODE_ALPHABET.length];
  }
  return code;
}

/** 时间戳（ISO 8601，含毫秒） */
export function nowIso(): string {
  return new Date().toISOString();
}
