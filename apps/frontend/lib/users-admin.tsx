"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE, getAuthToken, mapUser, readError, type User } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

export type StatusFilter = "all" | "pending" | "approved" | "rejected";

export function statusBadge(status?: string) {
  switch (status) {
    case "approved":
      return <Badge variant="success">已通过</Badge>;
    case "rejected":
      return <Badge variant="destructive">已拒绝</Badge>;
    case "pending":
      return <Badge variant="warning">待审核</Badge>;
    default:
      return <Badge variant="outline">{status || "-"}</Badge>;
  }
}

export function formatTime(value?: string) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("zh-CN");
  } catch {
    return value;
  }
}

export function roleLabel(role?: string) {
  return role === "admin" ? "管理员" : "采集员";
}

export function useAdminUsers(status: StatusFilter) {
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (status !== "all") qs.set("status", status);
      qs.set("page", "1");
      qs.set("pageSize", "50");
      const resp = await fetch(`${API_BASE}/admin/users?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        setError(await readError(resp));
        setItems([]);
        setTotal(0);
        return;
      }
      const data = await resp.json();
      setItems((data.items || []).map(mapUser));
      setTotal(data.total || 0);
    } catch {
      setError("加载用户列表失败");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const review = async (id: string, action: "approve" | "reject") => {
    const token = getAuthToken();
    if (!token) return;
    setActingId(id);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/admin/users/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        setError(await readError(resp));
        return;
      }
      await loadUsers();
    } catch {
      setError("操作失败，请重试");
    } finally {
      setActingId(null);
    }
  };

  return {
    items,
    total,
    loading,
    actingId,
    error,
    loadUsers,
    review,
  };
}
