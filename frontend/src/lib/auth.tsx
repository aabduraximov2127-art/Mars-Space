import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, post, refreshAccess, setAccessToken, setSessionExpiredHandler } from "./api";
import type { Role, User } from "./types";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (login: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUserState] = useState<User | null>(null);

  const reset = useCallback(() => {
    setAccessToken(null);
    setUserState(null);
    setStatus("anonymous");
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(reset);
    return () => setSessionExpiredHandler(null);
  }, [reset]);

  // Restore the session from the HttpOnly refresh cookie on page load.
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await refreshAccess();
      if (!alive) return;
      if (!token) {
        setStatus("anonymous");
        return;
      }
      try {
        const me = await api.get<User>("/auth/me/");
        if (!alive) return;
        setUserState(me.data);
        setStatus("authenticated");
      } catch {
        if (alive) setStatus("anonymous");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(
    async (loginValue: string, password: string) => {
      const data = await post<{ access: string; user: User }>("/auth/login/", { login: loginValue, password });
      queryClient.clear();
      setAccessToken(data.access);
      setUserState(data.user);
      setStatus("authenticated");
      return data.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await post("/auth/logout/");
    } catch {
      /* the session is dropped locally anyway */
    }
    reset();
  }, [reset]);

  const reloadUser = useCallback(async () => {
    const me = await api.get<User>("/auth/me/");
    setUserState(me.data);
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout, reloadUser, setUser: setUserState }),
    [status, user, login, logout, reloadUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** The signed-in user (only call inside authenticated routes). */
export function useMe(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useMe() outside of an authenticated route");
  return user;
}

export function useRole(): Role {
  return useMe().role;
}

export const isStaff = (role: Role) => role === "superadmin" || role === "admin";
