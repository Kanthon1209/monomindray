"use client";

import { API_BASE, getAuthToken, readError } from "@/lib/auth";

export type EqaFieldNode = {
  code: string;
  name: string;
  valueType: string;
  parentCode?: string;
  enumValues?: string[];
  sortOrder: number;
  usageCount?: number;
  children?: EqaFieldNode[];
};

export type EqaFieldUpsert = {
  code?: string;
  name: string;
  valueType?: string;
  parentCode?: string;
  enumValues?: string[];
  sortOrder?: number;
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

export async function createEqaField(body: EqaFieldUpsert) {
  return eqaFetch<{ field: EqaFieldNode }>("/eqa/fields", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateEqaField(code: string, body: EqaFieldUpsert) {
  return eqaFetch<{ field: EqaFieldNode }>(`/eqa/fields/${encodeURIComponent(code)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteEqaField(code: string) {
  return eqaFetch<{ ok: boolean }>(`/eqa/fields/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}

export async function fetchEqaDashboard(year?: number) {
  const qs = year ? `?year=${year}` : "";
  return eqaFetch<EqaDashboard>(`/eqa/dashboard${qs}`);
}

export async function fetchEqaParticipations(params?: {
  year?: number;
  scope?: string;
  hospitalId?: number | string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.year) qs.set("year", String(params.year));
  if (params?.scope) qs.set("scope", params.scope);
  if (params?.hospitalId) qs.set("hospitalId", String(params.hospitalId));
  qs.set("page", String(params?.page || 1));
  qs.set("pageSize", String(params?.pageSize || 50));
  return eqaFetch<{ total: number; items: EqaParticipation[] }>(
    `/eqa/participations?${qs.toString()}`,
  );
}

export async function fetchEqaParticipation(id: number | string) {
  return eqaFetch<{ participation: EqaParticipation }>(`/eqa/participations/${id}`);
}

/** Group checked EQA subjects under field_registry parents (国家/省级). */
export function groupEqaItemsByParent(
  items: EqaParticipationItem[] | undefined,
  fields: EqaFieldNode[],
): { parentCode: string; parentName: string; items: EqaParticipationItem[] }[] {
  const parentOf = new Map<string, { code: string; name: string }>();
  const walk = (nodes: EqaFieldNode[], parent?: EqaFieldNode) => {
    for (const n of nodes || []) {
      if (parent) parentOf.set(n.code, { code: parent.code, name: parent.name });
      if (n.children?.length) walk(n.children, n);
    }
  };
  walk(fields || []);
  const checked = (items || []).filter((it) => it.value);
  const order: string[] = [];
  const buckets = new Map<string, { parentCode: string; parentName: string; items: EqaParticipationItem[] }>();
  for (const it of checked) {
    const p = parentOf.get(it.fieldCode);
    const key = p?.code || "_";
    if (!buckets.has(key)) {
      order.push(key);
      buckets.set(key, {
        parentCode: key,
        parentName: p?.name || "参评科目",
        items: [],
      });
    }
    buckets.get(key)!.items.push(it);
  }
  return order.map((k) => buckets.get(k)!);
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


/** Derive display label from national/provincial presence for a year. */
export function deriveEqaLabel(hasNational: boolean, hasProvincial: boolean): string {
  if (hasNational && hasProvincial) return "EQA（国）+EQA（省、市）";
  if (hasNational) return "EQA（国）";
  if (hasProvincial) return "EQA（省、市）";
  return "";
}

export function scopeLabel(scope?: string) {
  if (scope === "national") return "国家";
  if (scope === "provincial") return "省级";
  return scope || "-";
}
