"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

// ===== 用户类型 =====
export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "collector";
  avatar?: string;
}

const STORAGE_KEY = "mindray_auth_token";
const USER_KEY = "mindray_auth_user";

// API 基础地址（通过 Next.js rewrite 代理，前端直接调 /api）
const API_BASE = "/api/v1";

// ===== Auth Context =====
interface AuthContextValue {
  user: MockUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化：从 localStorage 恢复登录状态
  useEffect(() => {
    const init = async () => {
      try {
        const token = localStorage.getItem(STORAGE_KEY);
        const storedUser = localStorage.getItem(USER_KEY);
        if (token && storedUser) {
          setUser(JSON.parse(storedUser));
          // 验证 token 是否仍然有效
          try {
            const resp = await fetch(`${API_BASE}/user/profile`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.user) {
                const u: MockUser = {
                  id: String(data.user.id),
                  name: data.user.name,
                  email: data.user.email,
                  role: data.user.role,
                  avatar: data.user.avatar,
                };
                setUser(u);
                localStorage.setItem(USER_KEY, JSON.stringify(u));
              }
            } else if (resp.status === 401) {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem(USER_KEY);
              setUser(null);
            }
          } catch {
            // 网络错误（开发阶段后端未启动），保留 localStorage 中的用户
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

      const data = await resp.json();

      if (!resp.ok) {
        return { success: false, error: data.msg || "登录失败" };
      }

      const u: MockUser = {
        id: String(data.user.id),
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        avatar: data.user.avatar,
      };

      setUser(u);
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

      const data = await resp.json();

      if (!resp.ok) {
        return { success: false, error: data.msg || "注册失败" };
      }

      const u: MockUser = {
        id: String(data.user.id),
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        avatar: data.user.avatar,
      };

      setUser(u);
      localStorage.setItem(STORAGE_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      return { success: true };
    } catch {
      return { success: false, error: "网络错误，请检查服务是否启动" };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
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
