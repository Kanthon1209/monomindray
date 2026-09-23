"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export type UserStatus = "pending" | "approved" | "rejected" | string;

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "collector" | string;
  status?: UserStatus;
  avatar?: string;
  createdAt?: string;
}

const STORAGE_KEY = "mindray_auth_token";
const USER_KEY = "mindray_auth_user";
export const API_BASE = "/api/v1";

export function mapUser(raw: any): User {
  return {
    id: String(raw.id),
    name: raw.name,
    email: raw.email,
    role: raw.role,
    status: raw.status,
    avatar: raw.avatar || undefined,
    createdAt: raw.createdAt,
  };
}

export async function readError(resp: Response): Promise<string> {
  try {
    const data = await resp.json();
    return data.msg || data.message || "请求失败";
  } catch {
    return `请求失败 (${resp.status})`;
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  updateProfile: (payload: {
    name: string;
    email: string;
    avatar?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const savedToken = localStorage.getItem(STORAGE_KEY);
        const storedUser = localStorage.getItem(USER_KEY);
        if (savedToken && storedUser) {
          setToken(savedToken);
          setUser(JSON.parse(storedUser));
          try {
            const resp = await fetch(`${API_BASE}/user/profile`, {
              headers: { Authorization: `Bearer ${savedToken}` },
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.user) {
                const u = mapUser(data.user);
                setUser(u);
                localStorage.setItem(USER_KEY, JSON.stringify(u));
              }
            } else if (resp.status === 401) {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem(USER_KEY);
              setToken(null);
              setUser(null);
            }
          } catch {
            // keep cached session when API is unreachable
          }
        }
      } catch {
        // ignore
      }
      setIsLoading(false);
    };
    init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const resp = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        return { success: false, error: await readError(resp) };
      }
      const data = await resp.json();
      const u = mapUser(data.user);
      setUser(u);
      setToken(data.token);
      localStorage.setItem(STORAGE_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      return { success: true };
    } catch {
      return { success: false, error: "网络错误，请检查服务是否启动" };
    }
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    try {
      const resp = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!resp.ok) {
        return { success: false, error: await readError(resp) };
      }
      const data = await resp.json();
      // Registration requires admin approval — do not auto-login.
      return {
        success: true,
        message: data.message || "注册成功，请等待管理员审核",
      };
    } catch {
      return { success: false, error: "网络错误，请检查服务是否启动" };
    }
  }, []);

  const updateProfile = useCallback(
    async (payload: { name: string; email: string; avatar?: string }) => {
      const savedToken = localStorage.getItem(STORAGE_KEY);
      if (!savedToken) {
        return { success: false, error: "未登录" };
      }
      try {
        const resp = await fetch(`${API_BASE}/user/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${savedToken}`,
          },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          return { success: false, error: await readError(resp) };
        }
        const data = await resp.json();
        const u = mapUser(data.user);
        setUser(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        return { success: true };
      } catch {
        return { success: false, error: "网络错误，请检查服务是否启动" };
      }
    },
    [],
  );

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, signup, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth 必须在 AuthProvider 内使用");
  }
  return ctx;
}

/** @deprecated use User */
export type MockUser = User;
