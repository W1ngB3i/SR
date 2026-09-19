import type { DeviceModule } from './enums.js';

/** 圈名脱敏：保留首字符；三字以内逐字补星，更长固定 4 星 */
export function desensitizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return '*';
  if (trimmed.length <= 3) return `${trimmed[0]}${'*'.repeat(trimmed.length - 1)}`;
  return `${trimmed[0]}****`;
}

/** 联系方式脱敏：保留前两位，其余逐位补星 */
export function maskContact(contact: string): string {
  const trimmed = contact.trim();
  if (trimmed.length <= 2) return '**';
  return `${trimmed.slice(0, 2)}${'*'.repeat(trimmed.length - 2)}`;
}

/** ISO 时间 → YYYY-MM-DD HH:mm */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO 时间 → YYYY-MM-DD */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatDateTime(iso).slice(0, 10);
}

/** 轻量 class 组合 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** 文件大小格式化 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 审核模块的可读标签 */
export function moduleLabel(module: DeviceModule): string {
  switch (module) {
    case 'PE':
      return 'PE PVP';
    case 'PC':
      return 'PC PVP';
    case 'BOTH':
      return 'PE + PC PVP';
    default:
      return module;
  }
}

/** 计算两个 ISO 时间之间的小时差（保留一位小数） */
export function hoursBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, Math.round((ms / 3_600_000) * 10) / 10);
}
