import { getDb } from '../db/index.js';
import { nowIso } from '../lib/ids.js';

/**
 * 机器人引导式申请会话：落库保存「一问一答」的中间状态，重启不丢。
 * 以 openid + target 作主键 —— 同一账号在群聊与私聊各自维护一份草稿，互不干扰。
 */

/** 引导步骤：圈名 → 接洽码 → 部门 → 模式 → 模块 → 自证 → 证据 → 确认 */
export type RobotSessionStep =
  | 'circle_name'
  | 'contact'
  | 'department'
  | 'mode'
  | 'module'
  | 'self_proof'
  | 'evidence'
  | 'confirm';

/** 已下载入库的证据（确认提交时直接写 attachment 表） */
export interface RobotEvidence {
  filename: string;
  kind: 'image' | 'video' | 'other';
  storage_key: string;
  size: number;
}

export interface ApplyDraft {
  circle_name?: string;
  contact?: string;
  department_id?: string;
  department_name?: string;
  mode_id?: string;
  mode_name?: string;
  module?: 'PE' | 'PC' | 'BOTH';
  self_proof?: boolean;
  evidence?: RobotEvidence[];
}

export interface RobotSession {
  openid: string;
  target: 'group' | 'c2c';
  step: RobotSessionStep;
  draft: ApplyDraft;
  updated_at: string;
}

/** 超时清理：超过该时长无任何回复的草稿自动作废 */
const SESSION_TTL_MS = 30 * 60 * 1000;

interface SessionRow {
  openid: string;
  target: 'group' | 'c2c';
  step: string;
  draft: string;
  created_at: string;
  updated_at: string;
}

function parseDraft(raw: string): ApplyDraft {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as ApplyDraft) : {};
  } catch {
    return {};
  }
}

/** 读取会话；已超时的草稿视为不存在并顺手删除 */
export function getSession(openid: string, target: 'group' | 'c2c'): RobotSession | null {
  const row = getDb()
    .prepare('SELECT * FROM robot_session WHERE openid = ? AND target = ?')
    .get(openid, target) as SessionRow | undefined;
  if (!row) return null;
  if (Date.parse(row.updated_at) + SESSION_TTL_MS < Date.now()) {
    clearSession(openid, target);
    return null;
  }
  return {
    openid: row.openid,
    target: row.target,
    step: row.step as RobotSessionStep,
    draft: parseDraft(row.draft),
    updated_at: row.updated_at,
  };
}

/** 写入 / 覆盖会话（每次交互都刷新 updated_at，达到滚动续期效果） */
export function saveSession(
  openid: string,
  target: 'group' | 'c2c',
  step: RobotSessionStep,
  draft: ApplyDraft,
): void {
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO robot_session (openid, target, step, draft, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(openid, target) DO UPDATE SET
         step = excluded.step,
         draft = excluded.draft,
         updated_at = excluded.updated_at`,
    )
    .run(openid, target, step, JSON.stringify(draft ?? {}), now, now);
}

export function clearSession(openid: string, target: 'group' | 'c2c'): void {
  getDb().prepare('DELETE FROM robot_session WHERE openid = ? AND target = ?').run(openid, target);
}

/** 清理全部超时草稿（进程启动时调用一次即可，数据量小无需定时器） */
export function pruneExpiredSessions(): number {
  const before = new Date(Date.now() - SESSION_TTL_MS).toISOString();
  return getDb().prepare('DELETE FROM robot_session WHERE updated_at < ?').run(before).changes;
}
