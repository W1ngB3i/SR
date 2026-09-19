import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { StaffUserDTO } from '@sr/shared';
import { readAuth, writeAuth, type StoredAuth } from './storage';
import { login as apiLogin } from '../api/staff';
import { UNAUTHORIZED_EVENT } from '../api/client';

interface AuthContextValue {
  auth: StoredAuth | null;
  user: StaffUserDTO | null;
  login: (username: string, password: string) => Promise<StaffUserDTO>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readAuth());

  useEffect(() => {
    const onUnauthorized = () => {
      writeAuth(null);
      setAuth((prev) => (prev ? null : prev));
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await apiLogin(username, password);
    const next: StoredAuth = { token: result.token, user: result.user };
    writeAuth(next);
    setAuth(next);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    writeAuth(null);
    setAuth(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ auth, user: auth?.user ?? null, login, logout }),
    [auth, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
