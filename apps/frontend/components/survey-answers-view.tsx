"use client";

import { useMemo } from "react";

import { type SurveyField } from "@/lib/business";
import {
  AssayTreeField,
  normalizeAssayBlockAnswer,
} from "@/components/assay-tree-field";
import { DeviceBlockField } from "@/components/device-block-field";
import {
  EqaParticipationField,
  normalizeEqaBlockAnswer,
} from "@/components/eqa-participation-field";

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function looksLikeAssayAnswer(v: unknown): boolean {
  if (!isPlainObject(v)) return false;
  if (Array.isArray(v.codes) && !("national" in v) && !("provincial" in v))
    return true;
  return false;
}

function looksLikeEqaAnswer(v: unknown): boolean {
  if (!isPlainObject(v)) return false;
  return "national" in v || "provincial" in v;
}

/** Sync text formatter for scalar / legacy answers. */
export function formatSurveyAnswerText(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || "—";

  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((x) => typeof x === "string" || typeof x === "number")) {
      return value.map(String).join("、");
    }
    return value
      .map((row) => {
        if (!isPlainObject(row)) return String(row);
        const parts = Object.entries(row)
          .filter(([, v]) => v != null && v !== "")
          .map(
            ([k, v]) =>
              `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`,
          );
        return parts.join(", ") || "—";
      })
      .join("；");
  }

  if (looksLikeAssayAnswer(value)) {
    const { codes } = normalizeAssayBlockAnswer(value);
    return codes.length ? `已选 ${codes.length} 项` : "未选";
  }

  if (looksLikeEqaAnswer(value)) {
    const eqa = normalizeEqaBlockAnswer(value);
    const parts: string[] = [`${eqa.year}年`];
    parts.push(
      eqa.national.participating
        ? `国考 ${eqa.national.codes.length} 项`
        : "国考未参与",
    );
    parts.push(
      eqa.provincial.participating
        ? `省考 ${eqa.provincial.codes.length} 项`
        : "省考未参与",
    );
    return parts.join("；");
  }

  if (isPlainObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }
  return String(value);
}

function looksLikeDeviceAnswer(v: any): boolean {
  if (!v || typeof v !== "object") return false;
  return Array.isArray((v as any).devices);
}

function fieldMeta(
  key: string,
  fields?: SurveyField[],
): { label: string; type?: string; field?: SurveyField } {
  const f = (fields || []).find((x) => x.key === key);
  if (f) return { label: f.label || key, type: f.type, field: f };
  if (key === "assays" || key.startsWith("assay"))
    return { label: "检测项目", type: "assay_block" };
  if (key === "devices" || key.startsWith("device"))
    return { label: "设备列表", type: "device_block" };
  if (key.startsWith("eqa")) return { label: "EQA", type: "eqa_block" };
  return { label: key };
}

/** Order fields like fill page: schema.sections then field order within each section. */
function orderedFieldKeys(
  answers: Record<string, any>,
  fields?: SurveyField[],
  sections?: string[],
): string[] {
  const ans = answers || {};
  if (!fields?.length) return Object.keys(ans);

  const bySection = new Map<string, SurveyField[]>();
  for (const f of fields) {
    if (f.type === "repeat") continue;
    const section = (f.section || "其他").trim() || "其他";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push(f);
  }

  const sectionNames: string[] = [];
  const seenSec = new Set<string>();
  for (const name of sections || []) {
    const key = (name || "").trim();
    if (!key || seenSec.has(key) || !bySection.has(key)) continue;
    sectionNames.push(key);
    seenSec.add(key);
  }
  for (const key of bySection.keys()) {
    if (!seenSec.has(key)) sectionNames.push(key);
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const sec of sectionNames) {
    for (const f of bySection.get(sec) || []) {
      if (seen.has(f.key)) continue;
      keys.push(f.key);
      seen.add(f.key);
    }
  }
  for (const k of Object.keys(ans)) {
    if (!seen.has(k)) keys.push(k);
  }
  return keys;
}

function groupKeysBySection(
  keys: string[],
  fields?: SurveyField[],
  sections?: string[],
): [string, string[]][] {
  if (!fields?.length) return [["", keys]];

  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const bySection = new Map<string, string[]>();
  const orphan: string[] = [];
  for (const k of keys) {
    const f = fieldByKey.get(k);
    if (!f) {
      orphan.push(k);
      continue;
    }
    const section = (f.section || "其他").trim() || "其他";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push(k);
  }

  const out: [string, string[]][] = [];
  const seen = new Set<string>();
  for (const name of sections || []) {
    const key = (name || "").trim();
    if (!key || seen.has(key) || !bySection.has(key)) continue;
    out.push([key, bySection.get(key)!]);
    seen.add(key);
  }
  for (const [key, list] of bySection.entries()) {
    if (seen.has(key)) continue;
    out.push([key, list]);
  }
  if (orphan.length) out.push(["其他", orphan]);
  return out;
}

type Props = {
  answers: Record<string, any>;
  /** Optional template fields for labels / typed render / order */
  fields?: SurveyField[];
  /** Template section order (same as fill page) */
  sections?: string[];
  className?: string;
};

export function SurveyAnswersView({
  answers,
  fields,
  sections,
  className,
}: Props) {
  const keys = useMemo(
    () => orderedFieldKeys(answers || {}, fields, sections),
    [answers, fields, sections],
  );
  const groups = useMemo(
    () => groupKeysBySection(keys, fields, sections),
    [keys, fields, sections],
  );

  if (!keys.length) {
    return <p className="text-sm text-muted-foreground">无答题内容</p>;
  }

  const renderField = (k: string) => {
    const v = (answers || {})[k];
    const meta = fieldMeta(k, fields);
    const isEqa = meta.type === "eqa_block" || looksLikeEqaAnswer(v);
    const isAssay = meta.type === "assay_block" || looksLikeAssayAnswer(v);
    const isDevice = meta.type === "device_block" || looksLikeDeviceAnswer(v);

    if (isEqa) {
      return (
        <div key={k} className="min-w-0 space-y-2 md:col-span-2">
          <div className="text-sm font-medium text-muted-foreground">
            {meta.label}
          </div>
          <EqaParticipationField
            value={v}
            onChange={() => {}}
            disabled
            config={{
              enableNational: meta.field?.enableNational !== false,
              enableProvincial: meta.field?.enableProvincial !== false,
            }}
          />
        </div>
      );
    }

    if (isAssay) {
      return (
        <div key={k} className="min-w-0 space-y-2 md:col-span-2">
          <div className="text-sm font-medium text-muted-foreground">
            {meta.label}
          </div>
          <AssayTreeField value={v} onChange={() => {}} disabled />
        </div>
      );
    }

    if (isDevice) {
      return (
        <div key={k} className="min-w-0 space-y-2 md:col-span-2">
          <div className="text-sm font-medium text-muted-foreground">
            {meta.label}
          </div>
          <DeviceBlockField
            value={v}
            onChange={() => {}}
            disabled
            subFieldOrder={meta.field?.subFieldOrder}
          />
        </div>
      );
    }

    return (
      <div key={k} className="min-w-0">
        <span className="text-muted-foreground">{meta.label}：</span>
        <span className="break-words">{formatSurveyAnswerText(v)}</span>
      </div>
    );
  };

  const showSectionHeaders = !!fields?.length && groups.some(([s]) => !!s);

  if (!showSectionHeaders) {
    return (
      <div className={className || "grid gap-3 text-sm md:grid-cols-2"}>
        {keys.map(renderField)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([section, sectionKeys]) => (
        <div key={section || "_"} className="space-y-2">
          {section ? (
            <div className="text-sm font-medium text-foreground">{section}</div>
          ) : null}
          <div className={className || "grid gap-3 text-sm md:grid-cols-2"}>
            {sectionKeys.map(renderField)}
          </div>
        </div>
      ))}
    </div>
  );
}
