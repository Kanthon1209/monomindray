"use client";

import { API_BASE, getAuthToken, readError } from "@/lib/auth";

export type EqaFieldNode = {
  code: string;
  name: string;
  valueType: string;
  parentCode?: string;
  enumValues?: string[];
  sortOrder: number;
  children?: EqaFieldNode[];
};

export type EqaParticipationItem = {
  id?: number;
  fieldCode: string;
  fieldName?: string;
  value: boolean;
};

export type EqaParticipation = {
  id: number;
  hospitalId: number;
  hospitalName?: string;
  year: number;
  scope: string;
  tags: string[];
  ownerUserId?: number;
  ownerName?: string;
  itemCount: number;
  items?: EqaParticipationItem[];
  createdAt?: string;
  updatedAt?: string;
};

export type EqaDashboard = {
  year: number;
  totalParticipations: number;
  coverageHospitals: number;
  byScope: { scope: string; count: number }[];
  topItems: { fieldCode: string; fieldName: string; count: number }[];
  ownerProgress: {
    ownerUserId?: number;
    ownerName: string;
    participation: number;
    itemCount: number;
  }[];
};

async function eqaFetch<T>(path: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  const token = getAuthToken();
  if (!token) return { error: "未登录" };
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!resp.ok) return { error: await readError(resp) };
    if (resp.status === 204) return { data: undefined as T };
    return { data: (await resp.json()) as T };
  } catch {
    return { error: "网络错误" };
  }
}

export async function fetchEqaFields() {
  return eqaFetch<{ items: EqaFieldNode[] }>("/eqa/fields");
}

export async function fetchEqaDashboard(year?: number) {
  const qs = year ? `?year=${year}` : "";
  return eqaFetch<EqaDashboard>(`/eqa/dashboard${qs}`);
}

export async function fetchEqaParticipations(params?: {
  year?: number;
  scope?: string;
  page?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.year) qs.set("year", String(params.year));
  if (params?.scope) qs.set("scope", params.scope);
  qs.set("page", String(params?.page || 1));
  qs.set("pageSize", "50");
  return eqaFetch<{ total: number; items: EqaParticipation[] }>(
    `/eqa/participations?${qs.toString()}`,
  );
}

export async function createEqaParticipation(body: {
  hospitalId: number;
  year: number;
  scope: string;
  ownerUserId?: number;
  items?: EqaParticipationItem[];
}) {
  return eqaFetch<{ participation: EqaParticipation }>("/eqa/participations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateEqaParticipation(
  id: number,
  body: Record<string, unknown>,
) {
  return eqaFetch<{ participation: EqaParticipation }>(`/eqa/participations/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteEqaParticipation(id: number) {
  return eqaFetch<{ ok: boolean }>(`/eqa/participations/${id}`, { method: "DELETE" });
}

export async function ensureEqaSurveyTemplate() {
  return eqaFetch<{ template: { id: number; code: string; title: string } }>(
    "/eqa/survey-template/ensure",
    { method: "POST" },
  );
}

export function scopeLabel(scope?: string) {
  if (scope === "national") return "国家";
  if (scope === "provincial") return "省级";
  return scope || "-";
}
