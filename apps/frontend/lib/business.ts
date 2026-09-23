import { API_BASE, getAuthToken, readError } from "@/lib/auth";
import type { Hospital, ProvinceData } from "@/lib/types";

export interface Customer {
  id: string;
  hospitalId?: string;
  hospitalName?: string;
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  remark?: string;
  createdAt?: string;
}

export interface CaseItem {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  deviceId?: string;
  deviceModel?: string;
  title: string;
  summary?: string;
  content?: string;
  status: string;
  collectedAt?: string;
  createdAt?: string;
}

export interface Device {
  id: string;
  hospitalId: string;
  category: string;
  model: string;
  serialNo?: string;
  status: string;
  installedAt?: string;
  remark?: string;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ data?: T; error?: string }> {
  const token = getAuthToken();
  if (!token) return { error: "未登录" };
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    if (!resp.ok) {
      return { error: await readError(resp) };
    }
    if (resp.status === 204) return { data: undefined as T };
    const data = (await resp.json()) as T;
    return { data };
  } catch {
    return { error: "网络错误，请检查服务是否启动" };
  }
}

function mapHospital(raw: any): Hospital {
  return {
    id: String(raw.id),
    name: raw.name,
    province: raw.province,
    city: raw.city,
    level: raw.level,
    type: raw.type,
    deviceCount: raw.deviceCount ?? 0,
    deviceModels: raw.deviceModels || [],
    status: raw.status,
    remark: raw.remark || undefined,
    archive: raw.archive || {},
  };
}

function mapCustomer(raw: any): Customer {
  return {
    id: String(raw.id),
    hospitalId: raw.hospitalId != null ? String(raw.hospitalId) : undefined,
    hospitalName: raw.hospitalName || undefined,
    name: raw.name,
    title: raw.title || undefined,
    phone: raw.phone || undefined,
    email: raw.email || undefined,
    remark: raw.remark || undefined,
    createdAt: raw.createdAt,
  };
}

function mapCase(raw: any): CaseItem {
  return {
    id: String(raw.id),
    hospitalId: String(raw.hospitalId),
    hospitalName: raw.hospitalName || undefined,
    deviceId: raw.deviceId != null ? String(raw.deviceId) : undefined,
    deviceModel: raw.deviceModel || undefined,
    title: raw.title,
    summary: raw.summary || undefined,
    content: raw.content || undefined,
    status: raw.status,
    collectedAt: raw.collectedAt,
    createdAt: raw.createdAt,
  };
}

function mapDevice(raw: any): Device {
  return {
    id: String(raw.id),
    hospitalId: String(raw.hospitalId),
    category: raw.category,
    model: raw.model,
    serialNo: raw.serialNo || undefined,
    status: raw.status,
    installedAt: raw.installedAt || undefined,
    remark: raw.remark || undefined,
  };
}

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === "" || v === "all") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function fetchDashboardHospitals(params: {
  region?: string;
  province?: string;
  city?: string;
  level?: string;
  type?: string;
  status?: string;
  deviceCategory?: string;
  deviceModel?: string;
  keyword?: string;
}) {
  const { data, error } = await apiFetch<{ total: number; items: any[] }>(
    `/dashboard/hospitals${qs({
      region: params.region,
      province: params.province,
      city: params.city,
      level: params.level,
      type: params.type,
      status: params.status,
      deviceCategory: params.deviceCategory,
      deviceModel: params.deviceModel,
      keyword: params.keyword,
    })}`,
  );
  if (error) return { error, items: [] as Hospital[], total: 0 };
  return {
    items: (data?.items || []).map(mapHospital),
    total: data?.total || 0,
  };
}

export async function fetchProvinceStats(region?: string) {
  const { data, error } = await apiFetch<{ items: ProvinceData[] }>(
    `/dashboard/provinces${qs({ region })}`,
  );
  if (error) return { error, items: [] as ProvinceData[] };
  return { items: data?.items || [] };
}

export async function listHospitals(params: {
  keyword?: string;
  province?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { data, error } = await apiFetch<{ total: number; items: any[] }>(
    `/hospitals${qs(params)}`,
  );
  if (error) return { error, items: [] as Hospital[], total: 0 };
  return {
    items: (data?.items || []).map(mapHospital),
    total: data?.total || 0,
  };
}

export async function getHospital(id: string) {
  const { data, error } = await apiFetch<{ hospital: any }>(`/hospitals/${id}`);
  if (error) return { error };
  return { hospital: mapHospital(data!.hospital) };
}

export async function createHospital(payload: Record<string, string>) {
  const { data, error } = await apiFetch<{ hospital: any }>("/hospitals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { hospital: mapHospital(data!.hospital) };
}

export async function updateHospital(id: string, payload: Record<string, string>) {
  const { data, error } = await apiFetch<{ hospital: any }>(`/hospitals/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { hospital: mapHospital(data!.hospital) };
}

export async function deleteHospital(id: string) {
  return apiFetch(`/hospitals/${id}`, { method: "DELETE" });
}

export async function listDevices(hospitalId: string) {
  const { data, error } = await apiFetch<{ items: any[] }>(
    `/hospitals/${hospitalId}/devices`,
  );
  if (error) return { error, items: [] as Device[] };
  return { items: (data?.items || []).map(mapDevice) };
}

export async function createDevice(
  hospitalId: string,
  payload: Record<string, string>,
) {
  const { data, error } = await apiFetch<{ device: any }>(
    `/hospitals/${hospitalId}/devices`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (error) return { error };
  return { device: mapDevice(data!.device) };
}

export async function deleteDevice(id: string) {
  return apiFetch(`/devices/${id}`, { method: "DELETE" });
}

export async function listCustomers(params: {
  keyword?: string;
  hospitalId?: string;
  page?: number;
  pageSize?: number;
}) {
  const { data, error } = await apiFetch<{ total: number; items: any[] }>(
    `/customers${qs(params)}`,
  );
  if (error) return { error, items: [] as Customer[], total: 0 };
  return {
    items: (data?.items || []).map(mapCustomer),
    total: data?.total || 0,
  };
}

export async function createCustomer(payload: {
  hospitalId?: number | null;
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  remark?: string;
}) {
  const { data, error } = await apiFetch<{ customer: any }>("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { customer: mapCustomer(data!.customer) };
}

export async function updateCustomer(
  id: string,
  payload: {
    hospitalId?: number | null;
    name: string;
    title?: string;
    phone?: string;
    email?: string;
    remark?: string;
  },
) {
  const { data, error } = await apiFetch<{ customer: any }>(`/customers/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { customer: mapCustomer(data!.customer) };
}

export async function deleteCustomer(id: string) {
  return apiFetch(`/customers/${id}`, { method: "DELETE" });
}

export async function listCases(params: {
  keyword?: string;
  status?: string;
  hospitalId?: string;
  page?: number;
  pageSize?: number;
}) {
  const { data, error } = await apiFetch<{ total: number; items: any[] }>(
    `/cases${qs(params)}`,
  );
  if (error) return { error, items: [] as CaseItem[], total: 0 };
  return {
    items: (data?.items || []).map(mapCase),
    total: data?.total || 0,
  };
}

export async function createCase(payload: {
  hospitalId: number;
  deviceId?: number | null;
  title: string;
  summary?: string;
  content?: string;
  status?: string;
}) {
  const { data, error } = await apiFetch<{ case: any }>("/cases", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { case: mapCase(data!.case) };
}

export async function updateCase(
  id: string,
  payload: {
    hospitalId: number;
    deviceId?: number | null;
    title: string;
    summary?: string;
    content?: string;
    status?: string;
  },
) {
  const { data, error } = await apiFetch<{ case: any }>(`/cases/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { case: mapCase(data!.case) };
}

export async function deleteCase(id: string) {
  return apiFetch(`/cases/${id}`, { method: "DELETE" });
}

// ---- surveys ----

export interface SurveyField {
  key: string;
  label: string;
  section: string;
  required?: boolean;
  type?: string;
  target?: string;
}

export interface SurveyTemplate {
  id: string;
  code: string;
  title: string;
  description?: string;
  schema: { fields: SurveyField[] };
  version: number;
  status: string;
}

export interface SurveyCampaign {
  id: string;
  templateId: string;
  templateCode?: string;
  templateTitle?: string;
  title: string;
  description?: string;
  dueAt?: string;
  status: string;
  assignmentCount: number;
  createdAt?: string;
  assignments?: {
    id: string;
    assigneeId: string;
    assigneeName?: string;
    assigneeEmail?: string;
    status: string;
    submissionId?: string;
    submissionStatus?: string;
  }[];
}

export interface SurveyAssignment {
  id: string;
  campaignId: string;
  campaignTitle?: string;
  campaignStatus?: string;
  dueAt?: string;
  status: string;
  templateId: string;
  templateCode?: string;
  templateTitle?: string;
  schema?: { fields: SurveyField[] };
  submissionId?: string;
  submissionStatus?: string;
  answers?: Record<string, string>;
  reviewNote?: string;
}

export interface SurveySubmission {
  id: string;
  assignmentId: string;
  campaignTitle?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  collectorName?: string;
  hospitalId?: string;
  answers: Record<string, string>;
  status: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

function parseSchema(raw: any): { fields: SurveyField[] } {
  if (!raw) return { fields: [] };
  if (typeof raw === "string") {
    try {
      return parseSchema(JSON.parse(raw));
    } catch {
      return { fields: [] };
    }
  }
  return { fields: Array.isArray(raw.fields) ? raw.fields : [] };
}

function mapTemplate(raw: any): SurveyTemplate {
  return {
    id: String(raw.id),
    code: raw.code,
    title: raw.title,
    description: raw.description || undefined,
    schema: parseSchema(raw.schema),
    version: raw.version ?? 1,
    status: raw.status,
  };
}

function mapCampaign(raw: any): SurveyCampaign {
  return {
    id: String(raw.id),
    templateId: String(raw.templateId),
    templateCode: raw.templateCode || undefined,
    templateTitle: raw.templateTitle || undefined,
    title: raw.title,
    description: raw.description || undefined,
    dueAt: raw.dueAt || undefined,
    status: raw.status,
    assignmentCount: raw.assignmentCount ?? 0,
    createdAt: raw.createdAt || undefined,
    assignments: (raw.assignments || []).map((a: any) => ({
      id: String(a.id),
      assigneeId: String(a.assigneeId),
      assigneeName: a.assigneeName || undefined,
      assigneeEmail: a.assigneeEmail || undefined,
      status: a.status,
      submissionId: a.submissionId != null ? String(a.submissionId) : undefined,
      submissionStatus: a.submissionStatus || undefined,
    })),
  };
}

function mapAssignment(raw: any): SurveyAssignment {
  return {
    id: String(raw.id),
    campaignId: String(raw.campaignId),
    campaignTitle: raw.campaignTitle || undefined,
    campaignStatus: raw.campaignStatus || undefined,
    dueAt: raw.dueAt || undefined,
    status: raw.status,
    templateId: String(raw.templateId),
    templateCode: raw.templateCode || undefined,
    templateTitle: raw.templateTitle || undefined,
    schema: parseSchema(raw.schema),
    submissionId: raw.submissionId != null ? String(raw.submissionId) : undefined,
    submissionStatus: raw.submissionStatus || undefined,
    answers: raw.answers || {},
    reviewNote: raw.reviewNote || undefined,
  };
}

function mapSubmission(raw: any): SurveySubmission {
  return {
    id: String(raw.id),
    assignmentId: String(raw.assignmentId),
    campaignTitle: raw.campaignTitle || undefined,
    assigneeName: raw.assigneeName || undefined,
    assigneeEmail: raw.assigneeEmail || undefined,
    collectorName: raw.collectorName || undefined,
    hospitalId: raw.hospitalId != null ? String(raw.hospitalId) : undefined,
    answers: raw.answers || {},
    status: raw.status,
    submittedAt: raw.submittedAt || undefined,
    reviewedAt: raw.reviewedAt || undefined,
    reviewNote: raw.reviewNote || undefined,
  };
}

export async function listSurveyTemplates() {
  const { data, error } = await apiFetch<{ items: any[] }>("/surveys/templates");
  if (error) return { error, items: [] as SurveyTemplate[] };
  return { items: (data?.items || []).map(mapTemplate) };
}

export async function listSurveyCampaigns(params?: { status?: string }) {
  const { data, error } = await apiFetch<{ total: number; items: any[] }>(
    `/surveys/campaigns${qs({ status: params?.status, page: 1, pageSize: 100 })}`,
  );
  if (error) return { error, items: [] as SurveyCampaign[], total: 0 };
  return {
    items: (data?.items || []).map(mapCampaign),
    total: data?.total || 0,
  };
}

export async function getSurveyCampaign(id: string) {
  const { data, error } = await apiFetch<{ campaign: any }>(`/surveys/campaigns/${id}`);
  if (error) return { error };
  return { campaign: mapCampaign(data!.campaign) };
}

export async function createSurveyCampaign(payload: {
  templateId: number;
  title: string;
  description?: string;
  dueAt?: string;
  assigneeIds: number[];
}) {
  const body: Record<string, unknown> = {
    templateId: payload.templateId,
    title: payload.title,
    assigneeIds: payload.assigneeIds,
  };
  if (payload.description) body.description = payload.description;
  if (payload.dueAt) body.dueAt = payload.dueAt;
  const { data, error } = await apiFetch<{ campaign: any }>("/surveys/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return { error };
  return { campaign: mapCampaign(data!.campaign) };
}

export async function closeSurveyCampaign(id: string) {
  const { data, error } = await apiFetch<{ campaign: any }>(
    `/surveys/campaigns/${id}/close`,
    { method: "POST" },
  );
  if (error) return { error };
  return { campaign: mapCampaign(data!.campaign) };
}

export async function listMySurveyAssignments(params?: { status?: string }) {
  const { data, error } = await apiFetch<{ total: number; items: any[] }>(
    `/me/survey-assignments${qs({ status: params?.status, page: 1, pageSize: 100 })}`,
  );
  if (error) return { error, items: [] as SurveyAssignment[], total: 0 };
  return {
    items: (data?.items || []).map(mapAssignment),
    total: data?.total || 0,
  };
}

export async function getMySurveyAssignment(id: string) {
  const { data, error } = await apiFetch<{ assignment: any }>(
    `/me/survey-assignments/${id}`,
  );
  if (error) return { error };
  return { assignment: mapAssignment(data!.assignment) };
}

export async function saveSurveyDraft(
  id: string,
  payload: { answers: Record<string, string>; hospitalId?: number },
) {
  const { data, error } = await apiFetch<{ submission: any }>(
    `/me/survey-assignments/${id}/draft`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
  if (error) return { error };
  return { submission: mapSubmission(data!.submission) };
}

export async function submitSurveyAssignment(
  id: string,
  payload: { answers: Record<string, string>; hospitalId?: number },
) {
  const { data, error } = await apiFetch<{ submission: any }>(
    `/me/survey-assignments/${id}/submit`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (error) return { error };
  return { submission: mapSubmission(data!.submission) };
}

export async function listSurveySubmissions(params?: { status?: string }) {
  const { data, error } = await apiFetch<{ total: number; items: any[] }>(
    `/surveys/submissions${qs({
      status: params?.status ?? "submitted",
      page: 1,
      pageSize: 100,
    })}`,
  );
  if (error) return { error, items: [] as SurveySubmission[], total: 0 };
  return {
    items: (data?.items || []).map(mapSubmission),
    total: data?.total || 0,
  };
}

export async function approveSurveySubmission(id: string, note?: string) {
  const { data, error } = await apiFetch<{ submission: any }>(
    `/surveys/submissions/${id}/approve`,
    { method: "POST", body: JSON.stringify({ note: note || "" }) },
  );
  if (error) return { error };
  return { submission: mapSubmission(data!.submission) };
}

export async function rejectSurveySubmission(id: string, note: string) {
  const { data, error } = await apiFetch<{ submission: any }>(
    `/surveys/submissions/${id}/reject`,
    { method: "POST", body: JSON.stringify({ note }) },
  );
  if (error) return { error };
  return { submission: mapSubmission(data!.submission) };
}

