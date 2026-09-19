import type { StaffUserDTO } from '@sr/shared';

const STORAGE_KEY = 'sr_admin_auth';

export interface StoredAuth {
  token: string;
  user: StaffUserDTO;
}

export function readAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (parsed?.token && parsed?.user?.id && parsed?.user?.role) return parsed;
  } catch {
    // 脏数据直接忽略
  }
  return null;
}

export function writeAuth(auth: StoredAuth | null): void {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else localStorage.removeItem(STORAGE_KEY);
}
