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

type Props = {
  answers: Record<string, any>;
  /** Optional template fields for labels / typed render */
  fields?: SurveyField[];
  className?: string;
};

export function SurveyAnswersView({ answers, fields, className }: Props) {
  const entries = useMemo(() => Object.entries(answers || {}), [answers]);

  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">无答题内容</p>;
  }

  return (
    <div className={className || "grid gap-3 text-sm md:grid-cols-2"}>
      {entries.map(([k, v]) => {
        const meta = fieldMeta(k, fields);
        const isEqa =
          meta.type === "eqa_block" || looksLikeEqaAnswer(v);
        const isAssay =
          meta.type === "assay_block" || looksLikeAssayAnswer(v);
        const isDevice =
          meta.type === "device_block" || looksLikeDeviceAnswer(v);

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
              <AssayTreeField
                value={v}
                onChange={() => {}}
                disabled
              />
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
      })}
    </div>
  );
}
