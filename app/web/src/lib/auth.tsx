import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AiMode, MeResponse, UserView } from '../types';
import { api, ApiError } from './api';

interface AuthState {
  user: UserView | null;
  /** /me 確認前は true（ガード判定を保留するため） */
  loading: boolean;
  aiMode: AiMode | null;
  setUser: (u: UserView | null) => void;
  setAiMode: (m: AiMode | null | undefined) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserView | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiMode, setAiModeState] = useState<AiMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MeResponse>('/me')
      .then((res) => {
        if (!cancelled) setUser(res.user ?? null);
      })
      .catch((e) => {
        // 未認証(401)・サーバー未起動時はゲスト扱い → ガードが /login へ誘導
        if (!cancelled && e instanceof ApiError && e.status !== 401) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAiMode = useCallback((m: AiMode | null | undefined) => {
    if (m) setAiModeState(m);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ログアウト失敗時もローカル状態は破棄する */
    }
    setUser(null);
    setAiModeState(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, aiMode, setUser, setAiMode, logout }),
    [user, loading, aiMode, setAiMode, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
