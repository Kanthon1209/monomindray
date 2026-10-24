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

export interface Device {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  brand?: string;
  category: string;
  assayLineCode?: string;
  model: string;
  serialNo?: string;
  status: string;
  installedAt?: string;
  enabledAt?: string;
  usageLocation?: string;
  remark?: string;
  serviceEvaluation?: string;
  reagentBrand?: string;
  monthlySampleVolume?: string;
  deptHead?: string;
  channelCsa?: string;
  itemCodes?: string[];
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
    district: raw.district || undefined,
    level: raw.level,
    type: raw.type,
    deviceCount: raw.deviceCount ?? 0,
    deviceModels: raw.deviceModels || [],
    status: raw.status,
    address: raw.address || undefined,
    remark: raw.remark || undefined,
    customerCode: raw.customerCode || undefined,
    region: raw.region || undefined,
    branchOffice: raw.branchOffice || undefined,
    attributes: raw.attributes || undefined,
    metrics: raw.metrics || undefined,
    archive: raw.archive || {},
    assayNames: Array.isArray(raw.assayNames) ? raw.assayNames.map(String) : [],
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

function mapDevice(raw: any): Device {
  return {
    id: String(raw.id),
    hospitalId: String(raw.hospitalId),
    hospitalName: raw.hospitalName || undefined,
    brand: raw.brand || "迈瑞",
    category: raw.category,
    assayLineCode: raw.assayLineCode || undefined,
    model: raw.model,
    serialNo: raw.serialNo || undefined,
    status: raw.status,
    installedAt: raw.installedAt || undefined,
    enabledAt: raw.enabledAt || undefined,
    usageLocation: raw.usageLocation || undefined,
    remark: raw.remark || undefined,
    serviceEvaluation: raw.serviceEvaluation || undefined,
    reagentBrand: raw.reagentBrand || undefined,
    monthlySampleVolume: raw.monthlySampleVolume || undefined,
    deptHead: raw.deptHead || undefined,
    channelCsa: raw.channelCsa || undefined,
    itemCodes: Array.isArray(raw.itemCodes) ? raw.itemCodes.map(String) : [],
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
  sort?: string;
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

export type HospitalUpsertPayload = {
  name: string;
  province: string;
  city: string;
  district?: string;
  level: string;
  type: string;
  status?: string;
  address?: string;
  remark?: string;
  customerCode?: string;
  region?: string;
  branchOffice?: string;
  attributes?: Record<string, string>;
};

export async function createHospital(payload: HospitalUpsertPayload) {
  const { data, error } = await apiFetch<{ hospital: any }>("/hospitals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { hospital: mapHospital(data!.hospital) };
}

export async function updateHospital(id: string, payload: HospitalUpsertPayload) {
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
  const { data, error } = await apiFetch<{ items: any[]; total?: number }>(
    `/hospitals/${hospitalId}/devices`,
  );
  if (error) return { error, items: [] as Device[], total: 0 };
  return {
    items: (data?.items || []).map(mapDevice),
    total: data?.total ?? (data?.items || []).length,
  };
}

export async function listAllDevices(params?: {
  hospitalId?: number;
  brand?: string;
  category?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const { data, error } = await apiFetch<{ total: number; items: any[] }>(
    `/devices${qs({
      hospitalId: params?.hospitalId,
      brand: params?.brand,
      category: params?.category,
      status: params?.status,
      keyword: params?.keyword,
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    })}`,
  );
  if (error) return { error, items: [] as Device[], total: 0 };
  return {
    items: (data?.items || []).map(mapDevice),
    total: data?.total || 0,
  };
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

export async function createDeviceGlobal(payload: {
  hospitalId: number;
  brand?: string;
  category: string;
  assayLineCode?: string;
  model: string;
  serialNo?: string;
  status?: string;
  installedAt?: string;
  enabledAt?: string;
  usageLocation?: string;
  remark?: string;
  serviceEvaluation?: string;
  reagentBrand?: string;
  monthlySampleVolume?: string;
  deptHead?: string;
  channelCsa?: string;
  itemCodes?: string[];
}) {
  const { data, error } = await apiFetch<{ device: any }>("/devices", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { device: mapDevice(data!.device) };
}

export async function updateDevice(
  id: string,
  payload: {
    hospitalId?: number;
    brand?: string;
    category: string;
    assayLineCode?: string;
    model: string;
    serialNo?: string;
    status?: string;
    installedAt?: string;
    enabledAt?: string;
    usageLocation?: string;
    remark?: string;
    serviceEvaluation?: string;
    reagentBrand?: string;
    monthlySampleVolume?: string;
    deptHead?: string;
    channelCsa?: string;
    itemCodes?: string[];
  },
) {
  const { data, error } = await apiFetch<{ device: any }>(`/devices/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
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


// ---- surveys ----

export interface SurveyField {
  key: string;
  label: string;
  section?: string;
  required?: boolean;
  type?: string;
  target?: string;
  /** 填写时下拉/联想数据源；未设置则纯手工录入 */
  optionsSource?: "assay_projects" | "hospitals";
  default?: string;
  locked?: boolean;
  options?: string[];
  itemLabel?: string;
  fields?: SurveyField[];
  /** EQA composite block: show national / provincial scopes */
  enableNational?: boolean;
  enableProvincial?: boolean;
  /** device_block: ordered list of collectable sub-field keys (e.g. brand, model) */
  subFieldOrder?: string[];
}

export interface SurveySchema {
  fields: SurveyField[];
  /** 分组顺序；可包含尚无字段的空组 */
  sections?: string[];
}

export interface SurveyTemplate {
  id: string;
  code: string;
  title: string;
  description?: string;
  schema: SurveySchema;
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
  defaults?: Record<string, string>;
  lockedKeys?: string[];
  /** hospital = pin hospitals; collector_open = assignee picks hospital, multi-fill */
  distributionMode?: "hospital" | "collector_open" | string;
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
  hospitalId?: string;
  hospitalName?: string;
  /** True when assignment does not pin a hospital (collector picks via typeahead). */
  hospitalOpen?: boolean;
  templateId: string;
  templateCode?: string;
  templateTitle?: string;
  schema?: SurveySchema;
  submissionId?: string;
  submissionStatus?: string;
  answers?: Record<string, any>;
  lockedKeys?: string[];
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
  /** Bound hospital display name from assignment/hospital master. */
  hospitalName?: string;
  answers: Record<string, any>;
  /** Template schema snapshot when API provides it (for review labels). */
  schema?: SurveySchema;
  status: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

function parseSchema(raw: any): SurveySchema {
  if (!raw) return { fields: [], sections: [] };
  if (typeof raw === "string") {
    try {
      return parseSchema(JSON.parse(raw));
    } catch {
      return { fields: [], sections: [] };
    }
  }
  const fields: SurveyField[] = Array.isArray(raw.fields) ? raw.fields : [];
  const sections = Array.isArray(raw.sections)
    ? raw.sections.filter((s: unknown) => typeof s === "string" && s.trim())
    : undefined;
  return { fields, sections };
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
    defaults: raw.defaults || undefined,
    lockedKeys: Array.isArray(raw.lockedKeys) ? raw.lockedKeys : undefined,
    distributionMode: raw.distributionMode || "hospital",
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
  const hospitalId =
    raw.hospitalId != null ? String(raw.hospitalId) : undefined;
  const hospitalOpen =
    raw.hospitalOpen === true ||
    hospitalId == null ||
    hospitalId === "" ||
    hospitalId === "0";
  return {
    id: String(raw.id),
    campaignId: String(raw.campaignId),
    campaignTitle: raw.campaignTitle || undefined,
    campaignStatus: raw.campaignStatus || undefined,
    dueAt: raw.dueAt || undefined,
    status: raw.status,
    hospitalId,
    hospitalName: raw.hospitalName || undefined,
    hospitalOpen,
    templateId: String(raw.templateId),
    templateCode: raw.templateCode || undefined,
    templateTitle: raw.templateTitle || undefined,
    schema: parseSchema(raw.schema),
    submissionId: raw.submissionId != null ? String(raw.submissionId) : undefined,
    submissionStatus: raw.submissionStatus || undefined,
    answers: raw.answers || {},
    lockedKeys: Array.isArray(raw.lockedKeys) ? raw.lockedKeys : undefined,
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
    hospitalName: raw.hospitalName || undefined,
    answers: raw.answers || {},
    schema: raw.schema ? parseSchema(raw.schema) : undefined,
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

export async function createSurveyTemplate(payload: {
  code: string;
  title: string;
  description?: string;
  schema?: SurveySchema;
  status?: string;
}) {
  const { data, error } = await apiFetch<{ template: any }>("/surveys/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { template: mapTemplate(data!.template) };
}

export async function updateSurveyTemplate(
  id: string,
  payload: {
    title?: string;
    description?: string;
    schema: SurveySchema;
    status?: string;
  },
) {
  const { data, error } = await apiFetch<{ template: any }>(`/surveys/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { template: mapTemplate(data!.template) };
}

/** Soft-delete (archive). If active campaigns reference the template, returns needsForce. */
export async function deleteSurveyTemplate(id: string, force = false) {
  const token = getAuthToken();
  if (!token) return { error: "未登录", needsForce: false as const };
  const q = force ? "?force=1" : "";
  try {
    const resp = await fetch(`${API_BASE}/surveys/templates/${id}${q}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (resp.status === 409) {
      return { error: await readError(resp), needsForce: true as const };
    }
    if (!resp.ok) {
      return { error: await readError(resp), needsForce: false as const };
    }
    const data = (await resp.json()) as { template: any };
    return { template: mapTemplate(data.template), needsForce: false as const };
  } catch {
    return { error: "网络错误，请检查服务是否启动", needsForce: false as const };
  }
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
  defaults?: Record<string, string>;
  lockedKeys?: string[];
  distributionMode?: "hospital" | "collector_open";
  assigneeId?: number;
  assigneeIds?: number[];
  hospitalIds?: number[];
}) {
  const mode = payload.distributionMode || "hospital";
  const body: Record<string, unknown> = {
    templateId: payload.templateId,
    title: payload.title,
    distributionMode: mode,
  };
  if (payload.assigneeId) body.assigneeId = payload.assigneeId;
  if (payload.assigneeIds && payload.assigneeIds.length > 0) {
    body.assigneeIds = payload.assigneeIds;
  }
  if (mode === "hospital") {
    body.hospitalIds = payload.hospitalIds || [];
  }
  if (payload.description) body.description = payload.description;
  if (payload.dueAt) body.dueAt = payload.dueAt;
  if (payload.defaults && Object.keys(payload.defaults).length > 0) {
    body.defaults = payload.defaults;
  }
  if (payload.lockedKeys && payload.lockedKeys.length > 0) {
    body.lockedKeys = payload.lockedKeys;
  }
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
  payload: { answers: Record<string, any>; hospitalId?: number },
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
  payload: { answers: Record<string, any>; hospitalId?: number },
) {
  const { data, error } = await apiFetch<{
    submission: any;
    nextAssignmentId?: number;
  }>(`/me/survey-assignments/${id}/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return {
    submission: mapSubmission(data!.submission),
    nextAssignmentId:
      data?.nextAssignmentId != null ? String(data.nextAssignmentId) : undefined,
  };
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

// ---- assay projects (检测项目字典) ----

export type AssayOwnership = "own" | "competitor";

export interface AssayProject {
  id: string;
  code?: string;
  name: string;
  parentCode?: string;
  kind?: "line" | "category" | "item" | string;
  sortOrder?: number;
  lineCategory?: string;
  company?: string;
  aliases: string[];
  ownership: AssayOwnership;
  status: string;
  usageCount: number;
  createdAt?: string;
  updatedAt?: string;
}

function mapAssayProject(raw: any): AssayProject {
  return {
    id: String(raw.id),
    code: raw.code || undefined,
    name: raw.name,
    parentCode: raw.parentCode || undefined,
    kind: raw.kind || undefined,
    sortOrder: raw.sortOrder ?? 0,
    lineCategory: raw.lineCategory || undefined,
    company: raw.company || undefined,
    aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
    ownership: raw.ownership === "own" ? "own" : "competitor",
    status: raw.status || "active",
    usageCount: raw.usageCount ?? 0,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function listAssayProjects(params?: {
  keyword?: string;
  company?: string;
  line?: string;
  status?: string;
  ownership?: string;
  kind?: string;
  page?: number;
  pageSize?: number;
}) {
  const { data, error } = await apiFetch<{
    total: number;
    items: any[];
    companies: string[];
  }>(
    `/assay-projects${qs({
      keyword: params?.keyword,
      company: params?.company,
      line: params?.line,
      status: params?.status,
      ownership: params?.ownership,
      kind: params?.kind,
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 100,
    })}`,
  );
  if (error) {
    return { error, items: [] as AssayProject[], total: 0, companies: [] as string[] };
  }
  return {
    items: (data?.items || []).map(mapAssayProject),
    total: data?.total || 0,
    companies: data?.companies || [],
  };
}

export async function createAssayProject(payload: {
  code?: string;
  name: string;
  parentCode?: string;
  kind?: string;
  sortOrder?: number;
  lineCategory?: string;
  company?: string;
  aliases?: string[];
  status?: string;
}) {
  const { data, error } = await apiFetch<{ project: any }>("/assay-projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { project: mapAssayProject(data!.project) };
}

export async function updateAssayProject(
  id: string,
  payload: {
    code?: string;
    name: string;
    parentCode?: string;
    kind?: string;
    sortOrder?: number;
    lineCategory?: string;
    company?: string;
    aliases?: string[];
    status?: string;
  },
) {
  const { data, error } = await apiFetch<{ project: any }>(`/assay-projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (error) return { error };
  return { project: mapAssayProject(data!.project) };
}

export async function deleteAssayProject(id: string) {
  return apiFetch<void>(`/assay-projects/${id}`, { method: "DELETE" });
}

export async function listAssayProjectOptions() {
  const { data, error } = await apiFetch<{ items: any[] }>("/assay-projects/options");
  if (error) {
    return {
      error,
      items: [] as { id: string; name: string; company?: string; ownership: string }[],
    };
  }
  return {
    items: (data?.items || []).map((raw) => ({
      id: String(raw.id),
      name: String(raw.name || ""),
      company: raw.company || undefined,
      ownership: raw.ownership === "own" ? "own" : "competitor",
    })),
  };
}

export type AssayTreeNode = {
  code: string;
  name: string;
  kind: "line" | "category" | "item" | string;
  sortOrder?: number;
  children?: AssayTreeNode[];
};

export async function fetchAssayTree() {
  const { data, error } = await apiFetch<{ items: AssayTreeNode[] }>(
    "/assay-projects/tree",
  );
  if (error) {
    return { error, items: [] as AssayTreeNode[] };
  }
  return { items: (data?.items || []) as AssayTreeNode[] };
}

export type HospitalAssayItem = { code: string; name: string };
export type HospitalAssayCategory = {
  code: string;
  name: string;
  lineCode?: string;
  lineName?: string;
  itemCount: number;
  items: HospitalAssayItem[];
};

export type HospitalAssayCompetitorDevice = {
  deviceId: number;
  brand: string;
  model: string;
  itemCodes?: string[];
  itemNames?: string[];
};

export type HospitalAssayCompetitorCategory = {
  code: string;
  name: string;
  lineCode?: string;
  lineName?: string;
  devices: HospitalAssayCompetitorDevice[];
};

export async function fetchHospitalAssays(hospitalId: string) {
  const { data, error } = await apiFetch<{
    codes: string[];
    names?: string[];
    categories?: HospitalAssayCategory[];
    competitors?: HospitalAssayCompetitorCategory[];
    mindrayLines?: string[];
  }>(`/hospitals/${hospitalId}/assays`);
  if (error) {
    return {
      error,
      codes: [] as string[],
      names: [] as string[],
      categories: [] as HospitalAssayCategory[],
      competitors: [] as HospitalAssayCompetitorCategory[],
      mindrayLines: [] as string[],
    };
  }
  return {
    codes: data?.codes || [],
    names: data?.names || [],
    categories: (data?.categories || []) as HospitalAssayCategory[],
    competitors: (data?.competitors || []) as HospitalAssayCompetitorCategory[],
    mindrayLines: (data?.mindrayLines || []) as string[],
  };
}

export async function replaceHospitalAssays(
  hospitalId: string,
  codes: string[],
  source?: string,
) {
  const { data, error } = await apiFetch<{ codes: string[] }>(
    `/hospitals/${hospitalId}/assays`,
    {
      method: "PUT",
      body: JSON.stringify({ codes, source: source || "own" }),
    },
  );
  if (error) return { error, codes: [] as string[] };
  return { codes: data?.codes || [] };
}

export type HospitalSearchOption = {
  id: string;
  name: string;
  province?: string;
  city?: string;
  district?: string;
  level?: string;
  type?: string;
};

/** Collector-safe hospital name typeahead (JWT shared route). */
export async function searchHospitalsForSurvey(keyword: string, limit = 40) {
  const { data, error } = await apiFetch<{ items: any[] }>(
    `/hospitals/search${qs({ keyword: keyword.trim() || undefined, limit })}`,
  );
  if (error) {
    return { error, items: [] as HospitalSearchOption[] };
  }
  return {
    items: (data?.items || []).map((raw) => ({
      id: String(raw.id),
      name: String(raw.name || ""),
      province: raw.province || undefined,
      city: raw.city || undefined,
      district: raw.district || undefined,
      level: raw.level || undefined,
      type: raw.type || undefined,
    })),
  };
}


/** Device brand typeahead: DISTINCT devices.brand + seed commons (JWT shared). */
export async function fetchDeviceBrandSuggestions(q = "", limit = 40) {
  const { data, error } = await apiFetch<{ items: string[] }>(
    `/devices/brands/suggestions${qs({ q: q.trim() || undefined, limit })}`,
  );
  if (error) {
    return { error, items: [] as string[] };
  }
  return {
    items: (data?.items || []).map((s) => String(s || "").trim()).filter(Boolean),
  };
}

// ---- collectable fields catalog ----

export type CollectableField = {
  code: string;
  domain: string;
  storageTarget: string;
  valueType: string;
  label: string;
  section: string;
  enumValues?: string[];
  optionsSource?: string;
  sortOrder?: number;
};

export async function listCollectableFields(domain?: string) {
  const { data, error } = await apiFetch<{ items: any[] }>(
    `/collectable-fields${qs({ domain: domain || undefined })}`,
  );
  if (error) {
    return { error, items: [] as CollectableField[] };
  }
  return {
    items: (data?.items || []).map(
      (raw): CollectableField => ({
        code: String(raw.code || ""),
        domain: String(raw.domain || ""),
        storageTarget: String(raw.storageTarget || raw.storage_target || ""),
        valueType: String(raw.valueType || raw.value_type || "text"),
        label: String(raw.label || ""),
        section: String(raw.section || ""),
        enumValues: Array.isArray(raw.enumValues)
          ? raw.enumValues.map(String)
          : Array.isArray(raw.enum_values)
            ? raw.enum_values.map(String)
            : [],
        optionsSource: raw.optionsSource || raw.options_source || undefined,
        sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
      }),
    ),
  };
}
