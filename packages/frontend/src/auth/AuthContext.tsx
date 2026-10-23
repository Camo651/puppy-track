import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { API_ROUTES, type User } from "@puppy-track/common";
import { api } from "@/api/client";
import { ApiError, clearToken, setToken } from "@/api/http";

interface AuthState {
  user: User | null;
  loading: boolean;
  loginUrl: string;
  signInWithToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const u = await api.me();
      setUser(u);
    } catch (err) {
      // Only a real 401 means the session is gone. Transient failures (network,
      // cold start) must not drop a valid session.
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const signInWithToken = useCallback(
    async (token: string) => {
      setToken(token);
      setLoading(true);
      await loadUser();
    },
    [loadUser],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, loginUrl: API_ROUTES.AUTH_DISCORD_LOGIN, signInWithToken, signOut }),
    [user, loading, signInWithToken, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
