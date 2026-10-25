"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import {
  fetchAssayTree,
  fetchDeviceBrandSuggestions,
  type AssayTreeNode,
} from "@/lib/business";
import { Button } from "@/components/ui/button";
import { ComboboxInput } from "@/components/ui/combobox-input";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEVICE_SERVICE_EVALUATION_OPTIONS,
  DEVICE_USAGE_LOCATION_OPTIONS,
} from "@/lib/hospital-archive";

export type DeviceBlockRow = {
  brand: string;
  model: string;
  serialNo?: string;
  installedAt?: string;
  enabledAt?: string;
  usageLocation?: string;
  assayLineCode: string;
  itemCodes: string[];
  serviceEvaluation?: string;
  reagentBrand?: string;
  monthlySampleVolume?: string;
  deptHead?: string;
  channelCsa?: string;
  remark?: string;
};

export type DeviceBlockAnswer = {
  devices: DeviceBlockRow[];
};

const SEED_BRANDS = ["迈瑞", "罗氏", "雅培", "西门子", "贝克曼", "Ortho", "希森美康", "积水"];

export function normalizeDeviceBlockAnswer(value: any): DeviceBlockAnswer {
  if (value && typeof value === "object" && Array.isArray(value.devices)) {
    return {
      devices: value.devices.map(normalizeRow).filter(Boolean) as DeviceBlockRow[],
    };
  }
  if (Array.isArray(value)) {
    return {
      devices: value.map(normalizeRow).filter(Boolean) as DeviceBlockRow[],
    };
  }
  return { devices: [] };
}

function normalizeRow(raw: any): DeviceBlockRow | null {
  if (!raw || typeof raw !== "object") return null;
  const itemCodes = Array.isArray(raw.itemCodes)
    ? raw.itemCodes.map(String).map((s: string) => s.trim()).filter(Boolean)
    : Array.isArray(raw.codes)
      ? raw.codes.map(String).map((s: string) => s.trim()).filter(Boolean)
      : [];
  // Keep explicit empty brand while typing; only default when field is absent (legacy / new).
  // Empty → 迈瑞 is applied on API create/submit, not on every keystroke.
  const hasBrandKey = raw.brand != null || raw.company != null;
  const brand = hasBrandKey
    ? String(raw.brand ?? raw.company ?? "").trim()
    : "迈瑞";
  return {
    brand,
    model: String(raw.model || "").trim(),
    serialNo: String(raw.serialNo || raw.serial_no || "").trim() || undefined,
    installedAt: String(raw.installedAt || raw.installed_at || "").trim() || undefined,
    enabledAt: String(raw.enabledAt || raw.enabled_at || "").trim() || undefined,
    usageLocation:
      String(raw.usageLocation || raw.usage_location || "").trim() || undefined,
    assayLineCode: String(raw.assayLineCode || raw.lineCode || "").trim(),
    itemCodes,
    serviceEvaluation:
      String(raw.serviceEvaluation || raw.service_evaluation || "").trim() ||
      undefined,
    reagentBrand:
      String(raw.reagentBrand || raw.reagent_brand || "").trim() || undefined,
    monthlySampleVolume:
      String(raw.monthlySampleVolume || raw.monthly_sample_volume || "").trim() ||
      undefined,
    deptHead: String(raw.deptHead || raw.dept_head || "").trim() || undefined,
    channelCsa:
      String(raw.channelCsa || raw.channel_csa || "").trim() || undefined,
    remark: String(raw.remark || "").trim() || undefined,
  };
}

function emptyRow(): DeviceBlockRow {
  return {
    brand: "迈瑞",
    model: "",
    serialNo: "",
    installedAt: "",
    enabledAt: "",
    usageLocation: "",
    assayLineCode: "",
    itemCodes: [],
    serviceEvaluation: "",
    reagentBrand: "",
    monthlySampleVolume: "",
    deptHead: "",
    channelCsa: "",
  };
}


function rowHasBasicInfo(row: DeviceBlockRow): boolean {
  return Boolean(
    (row.model || "").trim() ||
      (row.serialNo || "").trim() ||
      (row.assayLineCode || "").trim() ||
      (row.usageLocation || "").trim() ||
      (row.reagentBrand || "").trim() ||
      (row.deptHead || "").trim() ||
      (row.channelCsa || "").trim() ||
      (row.monthlySampleVolume || "").trim() ||
      (row.serviceEvaluation || "").trim() ||
      (row.itemCodes && row.itemCodes.length > 0),
  );
}

function deviceSummaryLine(row: DeviceBlockRow, lines: AssayTreeNode[]): string {
  const brand = (row.brand || "迈瑞").trim() || "迈瑞";
  const model = (row.model || "").trim() || "未填机型";
  const line = lines.find((n) => n.code === row.assayLineCode);
  const lineName = line?.name?.replace(/项目$/u, "") || "";
  const sn = (row.serialNo || "").trim();
  const parts = [`${brand} ${model}`];
  if (sn) parts.push(`SN ${sn}`);
  if (lineName) parts.push(lineName);
  if ((row.usageLocation || "").trim()) parts.push(row.usageLocation!.trim());
  return parts.join(" · ");
}

function leafItemsUnderLine(tree: AssayTreeNode[], lineCode: string): AssayTreeNode[] {
  const line = tree.find((n) => n.code === lineCode && n.kind === "line");
  if (!line) return [];
  const out: AssayTreeNode[] = [];
  const walk = (nodes: AssayTreeNode[]) => {
    for (const n of nodes) {
      if (n.kind === "item") out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(line.children || []);
  return out;
}

function categoriesUnderLine(tree: AssayTreeNode[], lineCode: string): AssayTreeNode[] {
  const line = tree.find((n) => n.code === lineCode && n.kind === "line");
  return (line?.children || []).filter((c) => c.kind === "category");
}

/** Canonical short keys for device_block sub-fields (fill UI order). */
export const DEFAULT_DEVICE_SUB_FIELD_ORDER = [
  "brand",
  "model",
  "serialNo",
  "installedAt",
  "enabledAt",
  "usageLocation",
  "assayLineCode",
  "itemCodes",
  "reagentBrand",
  "monthlySampleVolume",
  "deptHead",
  "channelCsa",
  "serviceEvaluation",
] as const;

export type DeviceSubFieldKey = (typeof DEFAULT_DEVICE_SUB_FIELD_ORDER)[number];

/** Accept either short keys (`brand`) or template keys (`devices[].brand`). */
export function normalizeDeviceSubFieldOrder(
  order?: string[] | null,
): DeviceSubFieldKey[] {
  const allowed = new Set<string>(DEFAULT_DEVICE_SUB_FIELD_ORDER);
  const seen = new Set<string>();
  const out: DeviceSubFieldKey[] = [];
  for (const raw of order || []) {
    const k = String(raw || "")
      .trim()
      .replace(/^devices\[\]\./, "");
    if (!k || !allowed.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k as DeviceSubFieldKey);
  }
  for (const k of DEFAULT_DEVICE_SUB_FIELD_ORDER) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

/** Default required sub-fields when template has not set subFieldRequired yet. */
export const DEFAULT_DEVICE_SUB_FIELD_REQUIRED: DeviceSubFieldKey[] = [
  "model",
  "serialNo",
  "installedAt",
  "enabledAt",
];

export const DEVICE_SUB_FIELD_LABELS: Record<DeviceSubFieldKey, string> = {
  brand: "所属公司",
  model: "机型",
  serialNo: "序列号",
  installedAt: "安装日期",
  enabledAt: "到期时间",
  usageLocation: "使用位置",
  assayLineCode: "所属检测线",
  itemCodes: "检测细项覆盖",
  reagentBrand: "试剂品牌",
  monthlySampleVolume: "月样本量",
  deptHead: "科室负责人",
  channelCsa: "渠道CSA",
  serviceEvaluation: "客户服务评价",
};

/** Accept short or `devices[].*` keys. `undefined`/`null` → defaults; `[]` → none. */
export function normalizeDeviceSubFieldRequired(
  required?: string[] | null,
): DeviceSubFieldKey[] {
  if (required == null) {
    return [...DEFAULT_DEVICE_SUB_FIELD_REQUIRED];
  }
  const allowed = new Set<string>(DEFAULT_DEVICE_SUB_FIELD_ORDER);
  const seen = new Set<string>();
  const out: DeviceSubFieldKey[] = [];
  for (const raw of required) {
    const k = String(raw || "")
      .trim()
      .replace(/^devices\[\]\./, "");
    if (!k || !allowed.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k as DeviceSubFieldKey);
  }
  return out;
}

function deviceSubFieldValue(row: DeviceBlockRow, key: DeviceSubFieldKey): unknown {
  switch (key) {
    case "brand":
      return row.brand;
    case "model":
      return row.model;
    case "serialNo":
      return row.serialNo;
    case "installedAt":
      return row.installedAt;
    case "enabledAt":
      return row.enabledAt;
    case "usageLocation":
      return row.usageLocation;
    case "assayLineCode":
      return row.assayLineCode;
    case "itemCodes":
      return row.itemCodes;
    case "reagentBrand":
      return row.reagentBrand;
    case "monthlySampleVolume":
      return row.monthlySampleVolume;
    case "deptHead":
      return row.deptHead;
    case "channelCsa":
      return row.channelCsa;
    case "serviceEvaluation":
      return row.serviceEvaluation;
    default:
      return undefined;
  }
}

export function isDeviceSubFieldFilled(
  row: DeviceBlockRow,
  key: DeviceSubFieldKey,
): boolean {
  const v = deviceSubFieldValue(row, key);
  if (key === "itemCodes") {
    return Array.isArray(v) && v.length > 0;
  }
  return String(v ?? "").trim() !== "";
}

/** Returns Chinese error message, or null if OK. Empty device list is allowed. */
export function validateDeviceBlockRequired(
  value: any,
  subFieldRequired?: string[] | null,
): string | null {
  const answer = normalizeDeviceBlockAnswer(value);
  if (answer.devices.length === 0) return null;
  const required = normalizeDeviceSubFieldRequired(subFieldRequired);
  if (required.length === 0) return null;
  const missing: string[] = [];
  answer.devices.forEach((row, i) => {
    for (const key of required) {
      if (!isDeviceSubFieldFilled(row, key)) {
        missing.push(
          `设备#${i + 1}.${DEVICE_SUB_FIELD_LABELS[key] || key}`,
        );
      }
    }
  });
  if (missing.length === 0) return null;
  return "请填写必填项：" + missing.join("、");
}

type Props = {
  value: any;
  onChange: (next: DeviceBlockAnswer) => void;
  disabled?: boolean;
  /** Template-configured display order; short or `devices[].*` keys. */
  subFieldOrder?: string[];
  /** Template-configured required sub-field keys; omit → defaults. */
  subFieldRequired?: string[];
};

export function DeviceBlockField({
  value,
  onChange,
  disabled,
  subFieldOrder,
  subFieldRequired,
}: Props) {
  const confirmDlg = useConfirmDialog();
  const [tree, setTree] = useState<AssayTreeNode[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>(SEED_BRANDS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const answer = useMemo(() => normalizeDeviceBlockAnswer(value), [value]);
  const orderedKeys = useMemo(
    () => normalizeDeviceSubFieldOrder(subFieldOrder),
    [subFieldOrder],
  );
  const requiredSet = useMemo(
    () => new Set(normalizeDeviceSubFieldRequired(subFieldRequired)),
    [subFieldRequired],
  );
  /** Indices currently expanded. Audit (disabled) defaults collapsed. */
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [hydratedExpand, setHydratedExpand] = useState(false);

  // Initial expand: editable empty rows open; filled / audit stay collapsed.
  useEffect(() => {
    if (hydratedExpand) return;
    if (loading) return;
    const next = new Set<number>();
    if (!disabled) {
      answer.devices.forEach((row, i) => {
        if (!rowHasBasicInfo(row)) next.add(i);
      });
    }
    setExpanded(next);
    setHydratedExpand(true);
  }, [loading, disabled, answer.devices, hydratedExpand]);

  // Keep expand set in range when list shrinks; do not auto-open filled rows.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i >= 0 && i < answer.devices.length) next.add(i);
      }
      return next;
    });
  }, [answer.devices.length]);

  const toggleExpanded = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const reqMark = (key: DeviceSubFieldKey) =>
    requiredSet.has(key) ? (
      <span className="ml-0.5 text-destructive">*</span>
    ) : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [res, brands] = await Promise.all([
        fetchAssayTree(),
        fetchDeviceBrandSuggestions("", 80),
      ]);
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setTree([]);
      } else {
        setTree(res.items || []);
      }
      if (!brands.error && brands.items.length) {
        setBrandOptions(brands.items);
      } else {
        setBrandOptions(SEED_BRANDS);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lines = useMemo(
    () => tree.filter((n) => n.kind === "line"),
    [tree],
  );

  const setDevices = (devices: DeviceBlockRow[]) => onChange({ devices });

  const updateRow = (index: number, patch: Partial<DeviceBlockRow>) => {
    const next = answer.devices.map((row, i) => {
      if (i !== index) return row;
      const merged = { ...row, ...patch };
      if (patch.assayLineCode != null && patch.assayLineCode !== row.assayLineCode) {
        // Changing line clears item selection (items belong to one line).
        merged.itemCodes = [];
      }
      return merged;
    });
    setDevices(next);
  };

  const toggleItem = (index: number, code: string, checked: boolean) => {
    const row = answer.devices[index];
    if (!row) return;
    const set = new Set(row.itemCodes);
    if (checked) set.add(code);
    else set.delete(code);
    updateRow(index, { itemCodes: Array.from(set) });
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">加载检测线目录…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  const addDevice = () => {
    const nextIndex = answer.devices.length;
    setDevices([...answer.devices, emptyRow()]);
    setExpanded((prev) => {
      const next = new Set<number>();
      // Collapse previously filled rows; keep empty ones + new row open.
      answer.devices.forEach((row, i) => {
        if (!rowHasBasicInfo(row)) next.add(i);
      });
      next.add(nextIndex);
      return next;
    });
  };

  return (
    <>
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {requiredSet.size > 0
          ? `必填：${Array.from(requiredSet)
              .map((k) => DEVICE_SUB_FIELD_LABELS[k] || k)
              .join(" / ")}。`
          : "当前模板未设置设备子字段必填。"}
        所属公司可联想或自定义（迈瑞 / 竞品）。已填设备默认收起，点击卡片展开编辑。
      </p>
      {answer.devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未添加设备。</p>
      ) : null}
      {answer.devices.map((row, index) => {
        const cats = row.assayLineCode
          ? categoriesUnderLine(tree, row.assayLineCode)
          : [];
        const selected = new Set(row.itemCodes);
        const isOpen = expanded.has(index);
        const filled = rowHasBasicInfo(row);
        // Empty row always show form while editing; audit always uses toggle.
        const showForm = disabled ? isOpen : isOpen || !filled;

        if (!showForm) {
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggleExpanded(index)}
              className="flex w-full items-center gap-2 rounded-md border bg-muted/20 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {deviceSummaryLine(row, lines)}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  设备 #{index + 1}
                  {(row.reagentBrand || "").trim()
                    ? ` · 试剂 ${(row.reagentBrand || "").trim()}`
                    : ""}
                  {(row.monthlySampleVolume || "").trim()
                    ? ` · 月样本 ${(row.monthlySampleVolume || "").trim()}`
                    : ""}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        }

        return (
          <div
            key={index}
            className="space-y-3 rounded-md border border-dashed p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => {
                  if (filled || disabled) toggleExpanded(index);
                }}
              >
                <p className="text-sm font-medium">设备 #{index + 1}</p>
                {filled || disabled ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : null}
              </button>
              {!disabled ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const ok = await confirmDlg.ask({
                      title: "删除设备",
                      description: `确认删除设备 #${index + 1}？`,
                      confirmLabel: "删除",
                    });
                    if (!ok) return;
                    setDevices(answer.devices.filter((_, i) => i !== index));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {orderedKeys.map((fieldKey) => {
                if (fieldKey === "brand") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>所属公司{reqMark("brand")}</Label>
                      <ComboboxInput
                        value={row.brand}
                        disabled={disabled}
                        placeholder="输入或选择公司（可自定义）"
                        options={brandOptions}
                        onChange={(v) => updateRow(index, { brand: v })}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        可自由输入；审核写入后下次联想会带出自定义公司名
                      </p>
                    </div>
                  );
                }
                if (fieldKey === "model") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>机型{reqMark("model")}</Label>
                      <Input
                        value={row.model}
                        disabled={disabled}
                        placeholder="如 BS-2000M / CL-8000"
                        onChange={(e) =>
                          updateRow(index, { model: e.target.value })
                        }
                      />
                    </div>
                  );
                }
                if (fieldKey === "serialNo") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>序列号{reqMark("serialNo")}</Label>
                      <Input
                        value={row.serialNo || ""}
                        disabled={disabled}
                        onChange={(e) =>
                          updateRow(index, { serialNo: e.target.value })
                        }
                      />
                    </div>
                  );
                }
                if (fieldKey === "installedAt") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>安装日期{reqMark("installedAt")}</Label>
                      <Input
                        type="date"
                        value={row.installedAt || ""}
                        disabled={disabled}
                        onChange={(e) =>
                          updateRow(index, { installedAt: e.target.value })
                        }
                      />
                    </div>
                  );
                }
                if (fieldKey === "enabledAt") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>到期时间{reqMark("enabledAt")}</Label>
                      <Input
                        type="date"
                        value={row.enabledAt || ""}
                        disabled={disabled}
                        onChange={(e) =>
                          updateRow(index, { enabledAt: e.target.value })
                        }
                      />
                    </div>
                  );
                }
                if (fieldKey === "usageLocation") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>使用位置{reqMark("usageLocation")}</Label>
                      <Select
                        value={
                          (() => {
                            const v = (row.usageLocation || "").trim();
                            if (!v) return undefined;
                            if (
                              (
                                DEVICE_USAGE_LOCATION_OPTIONS as readonly string[]
                              ).includes(v)
                            )
                              return v;
                            return "其他";
                          })()
                        }
                        disabled={disabled}
                        onValueChange={(v) => {
                          if (v === "其他") {
                            const cur = (row.usageLocation || "").trim();
                            const isPreset = (
                              DEVICE_USAGE_LOCATION_OPTIONS as readonly string[]
                            ).includes(cur);
                            updateRow(index, {
                              usageLocation: !cur || isPreset ? "其他" : cur,
                            });
                          } else {
                            updateRow(index, { usageLocation: v });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择使用位置" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEVICE_USAGE_LOCATION_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(() => {
                        const v = (row.usageLocation || "").trim();
                        const isOther =
                          v === "其他" ||
                          (v !== "" &&
                            !(
                              DEVICE_USAGE_LOCATION_OPTIONS as readonly string[]
                            ).includes(v));
                        if (!isOther) return null;
                        return (
                          <Input
                            className="mt-1.5"
                            value={v === "其他" ? "" : v}
                            disabled={disabled}
                            placeholder="请填写具体位置"
                            onChange={(e) =>
                              updateRow(index, {
                                usageLocation: e.target.value.trim()
                                  ? e.target.value
                                  : "其他",
                              })
                            }
                          />
                        );
                      })()}
                    </div>
                  );
                }
                if (fieldKey === "assayLineCode") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>所属检测线{reqMark("assayLineCode")}</Label>
                      <Select
                        value={row.assayLineCode || undefined}
                        disabled={disabled}
                        onValueChange={(v) =>
                          updateRow(index, { assayLineCode: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择检测线" />
                        </SelectTrigger>
                        <SelectContent>
                          {lines.map((line) => (
                            <SelectItem key={line.code} value={line.code}>
                              {line.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (fieldKey === "reagentBrand") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>试剂品牌{reqMark("reagentBrand")}</Label>
                      <Input
                        value={row.reagentBrand || ""}
                        disabled={disabled}
                        placeholder="如 迈瑞 / 罗氏"
                        onChange={(e) =>
                          updateRow(index, { reagentBrand: e.target.value })
                        }
                      />
                    </div>
                  );
                }
                if (fieldKey === "monthlySampleVolume") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>月样本量{reqMark("monthlySampleVolume")}</Label>
                      <Input
                        value={row.monthlySampleVolume || ""}
                        disabled={disabled}
                        placeholder="如 1200"
                        onChange={(e) =>
                          updateRow(index, {
                            monthlySampleVolume: e.target.value,
                          })
                        }
                      />
                    </div>
                  );
                }
                if (fieldKey === "deptHead") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>科室负责人{reqMark("deptHead")}</Label>
                      <Input
                        value={row.deptHead || ""}
                        disabled={disabled}
                        placeholder="姓名"
                        onChange={(e) =>
                          updateRow(index, { deptHead: e.target.value })
                        }
                      />
                    </div>
                  );
                }
                if (fieldKey === "channelCsa") {
                  return (
                    <div key={fieldKey} className="space-y-1.5">
                      <Label>渠道CSA{reqMark("channelCsa")}</Label>
                      <Input
                        value={row.channelCsa || ""}
                        disabled={disabled}
                        placeholder="渠道 CSA"
                        onChange={(e) =>
                          updateRow(index, { channelCsa: e.target.value })
                        }
                      />
                    </div>
                  );
                }
                if (fieldKey === "serviceEvaluation") {
                  return (
                    <div key={fieldKey} className="space-y-1.5 md:col-span-2">
                      <Label>客户服务评价{reqMark("serviceEvaluation")}</Label>
                      <Select
                        value={row.serviceEvaluation || undefined}
                        disabled={disabled}
                        onValueChange={(v) =>
                          updateRow(index, { serviceEvaluation: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择服务评价（系统预设）" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEVICE_SERVICE_EVALUATION_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (fieldKey === "itemCodes") {
                  return (
                    <div key={fieldKey} className="md:col-span-2">
                      {row.assayLineCode ? (
                        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs text-muted-foreground">
                              该检测线下细项（已选 {row.itemCodes.length}）
                              {reqMark("itemCodes")}
                            </Label>
                            {!disabled && cats.length > 0 ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => {
                                  const all = leafItemsUnderLine(
                                    tree,
                                    row.assayLineCode,
                                  ).map((i) => i.code);
                                  const allSelected = all.every((c) =>
                                    selected.has(c),
                                  );
                                  updateRow(index, {
                                    itemCodes: allSelected ? [] : all,
                                  });
                                }}
                              >
                                {leafItemsUnderLine(
                                  tree,
                                  row.assayLineCode,
                                ).every((i) => selected.has(i.code))
                                  ? "清空"
                                  : "全选"}
                              </Button>
                            ) : null}
                          </div>
                          {cats.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              该检测线下暂无细项目录
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {cats.map((cat) => {
                                const items = (cat.children || []).filter(
                                  (c) => c.kind === "item",
                                );
                                if (items.length === 0) return null;
                                const catCodes = items.map((i) => i.code);
                                const catSelected = catCodes.filter((c) =>
                                  selected.has(c),
                                ).length;
                                const catAllOn =
                                  catSelected === catCodes.length &&
                                  catCodes.length > 0;
                                return (
                                  <div key={cat.code} className="space-y-1.5">
                                    <div className="flex min-h-7 items-center gap-2">
                                      <span
                                        className="text-xs font-medium leading-7 text-muted-foreground"
                                        title={cat.name}
                                      >
                                        {cat.name}
                                      </span>
                                      <span className="text-xs leading-7 text-muted-foreground">
                                        {catSelected}/{catCodes.length}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                                      <label className="inline-flex items-center gap-1.5 text-sm font-medium">
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5"
                                          disabled={disabled}
                                          checked={catAllOn}
                                          ref={(el) => {
                                            if (el) {
                                              el.indeterminate =
                                                catSelected > 0 && !catAllOn;
                                            }
                                          }}
                                          onChange={() => {
                                            const set = new Set(row.itemCodes);
                                            if (catAllOn) {
                                              catCodes.forEach((c) =>
                                                set.delete(c),
                                              );
                                            } else {
                                              catCodes.forEach((c) =>
                                                set.add(c),
                                              );
                                            }
                                            updateRow(index, {
                                              itemCodes: Array.from(set),
                                            });
                                          }}
                                        />
                                        全选
                                      </label>
                                      {items.map((it) => (
                                        <label
                                          key={it.code}
                                          className="inline-flex items-center gap-1.5 text-sm"
                                        >
                                          <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5"
                                            disabled={disabled}
                                            checked={selected.has(it.code)}
                                            onChange={(e) =>
                                              toggleItem(
                                                index,
                                                it.code,
                                                e.target.checked,
                                              )
                                            }
                                          />
                                          {it.name}
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          请先选择所属检测线，再勾选细项。
                        </p>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>
            {filled && !disabled ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.delete(index);
                      return next;
                    });
                  }}
                >
                  收起
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
      {!disabled ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={addDevice}
        >
          <Plus className="mr-1 h-4 w-4" />
          添加设备
        </Button>
      ) : null}
    </div>
    {confirmDlg.dialog}
    </>
  );
}
