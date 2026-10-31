"use client";

import { API_BASE, getAuthToken, readError } from "@/lib/auth";

export type PasswordResetStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "used"
  | "expired"
  | string;

export type PasswordResetItem = {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: string;
  status: PasswordResetStatus;
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: number;
  rejectReason?: string;
  tokenExpiresAt?: string;
  resetToken?: string;
  resetPath?: string;
};

export async function requestPasswordReset(email: string) {
  const resp = await fetch(`${API_BASE}/auth/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!resp.ok) return { ok: false as const, error: await readError(resp) };
  const data = await resp.json();
  return { ok: true as const, message: (data.message as string) || "申请已提交" };
}

export async function validatePasswordResetToken(token: string) {
  const qs = new URLSearchParams({ token });
  const resp = await fetch(`${API_BASE}/auth/password-reset/validate?${qs}`);
  if (!resp.ok) return { valid: false, msg: await readError(resp) };
  const data = await resp.json();
  return {
    valid: Boolean(data.valid),
    email: (data.email as string) || "",
    msg: (data.msg as string) || "",
  };
}

export async function confirmPasswordReset(token: string, password: string) {
  const resp = await fetch(`${API_BASE}/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!resp.ok) return { ok: false as const, error: await readError(resp) };
  const data = await resp.json();
  return { ok: true as const, message: (data.message as string) || "密码已更新" };
}

export async function listPasswordResetRequests(params: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const token = getAuthToken();
  if (!token) return { ok: false as const, error: "未登录", total: 0, items: [] as PasswordResetItem[] };
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  qs.set("page", String(params.page || 1));
  qs.set("pageSize", String(params.pageSize || 50));
  const resp = await fetch(`${API_BASE}/admin/password-reset-requests?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    return { ok: false as const, error: await readError(resp), total: 0, items: [] as PasswordResetItem[] };
  }
  const data = await resp.json();
  return {
    ok: true as const,
    total: Number(data.total) || 0,
    items: (Array.isArray(data.items) ? data.items : []) as PasswordResetItem[],
  };
}

export async function reviewPasswordReset(
  id: number,
  action: "approve" | "reject",
  reason?: string,
) {
  const token = getAuthToken();
  if (!token) return { ok: false as const, error: "未登录" };
  const resp = await fetch(`${API_BASE}/admin/password-reset-requests/${id}/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: action === "reject" ? JSON.stringify({ reason: reason || "" }) : "{}",
  });
  if (!resp.ok) return { ok: false as const, error: await readError(resp) };
  const data = await resp.json();
  return { ok: true as const, item: data.item as PasswordResetItem };
}

export function buildResetLink(resetPath: string) {
  if (typeof window === "undefined") return resetPath;
  return `${window.location.origin}${resetPath.startsWith("/") ? "" : "/"}${resetPath}`;
}
