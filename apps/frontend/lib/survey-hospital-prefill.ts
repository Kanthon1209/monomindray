import type { SurveyField } from "@/lib/business";

export type PrefillMergeMode = "pick" | "lookup";

function isDeviceLike(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (value && typeof value === "object" && Array.isArray((value as { devices?: unknown }).devices)) {
    return true;
  }
  return false;
}

function deviceRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { devices?: unknown[] }).devices)) {
    return (value as { devices: unknown[] }).devices;
  }
  return [];
}

function isEqaLike(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as { national?: unknown; provincial?: unknown };
  return v.national != null || v.provincial != null;
}

function isAssayLike(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (value && typeof value === "object" && Array.isArray((value as { codes?: unknown }).codes)) {
    return true;
  }
  return false;
}

function scopeHasCodes(scope: unknown): boolean {
  if (!scope || typeof scope !== "object") return false;
  const codes = (scope as { codes?: unknown }).codes;
  return Array.isArray(codes) && codes.some((c) => String(c || "").trim());
}

export function isPrefillValueEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return false;
  if (typeof value === "boolean") return false;
  if (isDeviceLike(value)) {
    return deviceRows(value).every((row) => {
      if (!row || typeof row !== "object") return true;
      const r = row as Record<string, unknown>;
      const codes = Array.isArray(r.itemCodes) ? r.itemCodes : [];
      return !(
        String(r.model || "").trim() ||
        String(r.serialNo || "").trim() ||
        String(r.assayLineCode || "").trim() ||
        String(r.usageLocation || "").trim() ||
        codes.length > 0
      );
    });
  }
  if (isEqaLike(value)) {
    const v = value as { national?: unknown; provincial?: unknown };
    return !scopeHasCodes(v.national) && !scopeHasCodes(v.provincial);
  }
  if (isAssayLike(value)) {
    const codes = Array.isArray(value)
      ? value
      : ((value as { codes?: unknown[] }).codes ?? []);
    return !codes.some((c) => String(c || "").trim());
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

export function prefillValuesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

function isHospitalMappedField(field: SurveyField): boolean {
  const typ = (field.type || "").toLowerCase();
  if (typ === "device_block" || typ === "eqa_block" || typ === "assay_block") return true;
  if (typ === "repeat" && field.key === "devices") return true;
  const t = (field.target || "").trim();
  if (t.startsWith("hospital.")) return true;
  const key = (field.key || "").toLowerCase();
  return (
    key === "name" ||
    key === "hospitalname" ||
    key === "customername" ||
    key === "province" ||
    key === "city" ||
    key === "district" ||
    key === "region" ||
    key === "level" ||
    key === "type" ||
    key === "address" ||
    key === "contactname" ||
    key === "contactphone" ||
    key === "customercode" ||
    key === "branchoffice" ||
    key === "msporderno" ||
    key === "msp_order_no"
  );
}

/** Merge a hospital prefill into current answers without clobbering unrelated user input. */
export function mergeHospitalPrefillAnswers(opts: {
  current: Record<string, any>;
  incoming: Record<string, any>;
  previousPrefill: Record<string, any> | null;
  mode: PrefillMergeMode;
  fields: SurveyField[];
}): Record<string, any> {
  const next = { ...opts.current };
  const fieldByKey = new Map(opts.fields.map((f) => [f.key, f]));
  for (const [key, incoming] of Object.entries(opts.incoming || {})) {
    const current = next[key];
    const previous = opts.previousPrefill ? opts.previousPrefill[key] : undefined;
    const field = fieldByKey.get(key);
    const mapped = field ? isHospitalMappedField(field) : true;
    const typ = (field?.type || "").toLowerCase();
    const isBlock =
      typ === "device_block" ||
      typ === "eqa_block" ||
      typ === "assay_block" ||
      (typ === "repeat" && key === "devices") ||
      isDeviceLike(incoming) ||
      isEqaLike(incoming) ||
      isAssayLike(incoming);

    const empty = isPrefillValueEmpty(current);
    const stillAuto = opts.previousPrefill != null && prefillValuesEqual(current, previous);
    if (isBlock) {
      if (empty || stillAuto) next[key] = incoming;
      continue;
    }
    if (!mapped) {
      if (empty) next[key] = incoming;
      continue;
    }
    if (opts.mode === "pick" || empty || stillAuto) {
      next[key] = incoming;
    }
  }
  return next;
}
