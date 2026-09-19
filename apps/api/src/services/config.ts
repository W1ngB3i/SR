import {
  DEFAULT_FEEDBACK_CONTACTS,
  DEFAULT_INTENTIONS,
  type FeedbackContacts,
} from '@sr/shared';
import { getDb } from '../db/index.js';
import { nowIso } from '../lib/ids.js';
import { writeAudit } from './audit.js';

export interface UploadLimits {
  max_file_mb: number;
  max_files: number;
  image_ext: string[];
  video_ext: string[];
}

export interface ConfigMap {
  intentions: string[];
  feedback_contacts: FeedbackContacts;
  submission_cooldown_hours: number;
  reviewer_max_concurrent: number;
  upload_limits: UploadLimits;
}

export const CONFIG_DEFAULTS: ConfigMap = {
  intentions: [...DEFAULT_INTENTIONS],
  feedback_contacts: {
    chief: { ...DEFAULT_FEEDBACK_CONTACTS.chief },
    deputy: { ...DEFAULT_FEEDBACK_CONTACTS.deputy },
  },
  submission_cooldown_hours: 24,
  reviewer_max_concurrent: 5,
  upload_limits: {
    max_file_mb: 200,
    max_files: 6,
    image_ext: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
    video_ext: ['.mp4', '.mov', '.webm', '.mkv'],
  },
};

export type ConfigKey = keyof ConfigMap;

const NUMERIC_KEYS: ConfigKey[] = ['submission_cooldown_hours', 'reviewer_max_concurrent'];

/** 读取配置（带类型兜底），规则配置中心的后端载体 */
export function getConfig<K extends ConfigKey>(key: K): ConfigMap[K] {
  const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  if (!row) return CONFIG_DEFAULTS[key];
  try {
    const parsed = JSON.parse(row.value);
    if (NUMERIC_KEYS.includes(key)) {
      const n = Number(parsed);
      return (Number.isFinite(n) && n >= 0 ? n : CONFIG_DEFAULTS[key]) as ConfigMap[K];
    }
    return parsed as ConfigMap[K];
  } catch {
    return CONFIG_DEFAULTS[key];
  }
}

export function getAllConfig(): (ConfigMap & Record<string, unknown>) & { _meta?: unknown } {
  return {
    intentions: getConfig('intentions'),
    feedback_contacts: getConfig('feedback_contacts'),
    submission_cooldown_hours: getConfig('submission_cooldown_hours'),
    reviewer_max_concurrent: getConfig('reviewer_max_concurrent'),
    upload_limits: getConfig('upload_limits'),
  };
}

const CONFIG_LABELS: Record<ConfigKey, string> = {
  intentions: '审核意向选项',
  feedback_contacts: '反馈渠道',
  submission_cooldown_hours: '提交冷却期（小时）',
  reviewer_max_concurrent: '审核员同时处理上限',
  upload_limits: '证据上传限制',
};

/** 更新配置：版本号自增并写审计日志 */
export function setConfig<K extends ConfigKey>(
  key: K,
  value: ConfigMap[K],
  operator: { id: string | null; name: string } | null,
): void {
  const db = getDb();
  const before = getConfig(key);
  const now = nowIso();
  const existing = db.prepare('SELECT version FROM config WHERE key = ?').get(key) as
    | { version: number }
    | undefined;
  if (existing) {
    db.prepare(
      'UPDATE config SET value = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE key = ?',
    ).run(JSON.stringify(value), operator?.name ?? '', now, key);
  } else {
    db.prepare(
      'INSERT INTO config (key, value, version, updated_by, updated_at) VALUES (?, ?, 1, ?, ?)',
    ).run(key, JSON.stringify(value), operator?.name ?? '', now);
  }
  writeAudit({
    operator,
    action: 'config.update',
    resource: 'config',
    targetId: key,
    before: JSON.stringify(before),
    after: JSON.stringify(value),
    detail: `更新配置：${CONFIG_LABELS[key]}`,
  });
}
