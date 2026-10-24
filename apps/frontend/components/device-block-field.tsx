"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { fetchAssayTree, type AssayTreeNode } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEVICE_SERVICE_EVALUATION_OPTIONS } from "@/lib/hospital-archive";

export type DeviceBlockRow = {
  brand: string;
  model: string;
  serialNo?: string;
  assayLineCode: string;
  itemCodes: string[];
  serviceEvaluation?: string;
  remark?: string;
};

export type DeviceBlockAnswer = {
  devices: DeviceBlockRow[];
};

const COMMON_BRANDS = ["迈瑞", "罗氏", "雅培", "西门子", "贝克曼", "Ortho", "其它"];

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
  return {
    brand: String(raw.brand || raw.company || "迈瑞").trim() || "迈瑞",
    model: String(raw.model || "").trim(),
    serialNo: String(raw.serialNo || "").trim() || undefined,
    assayLineCode: String(raw.assayLineCode || raw.lineCode || "").trim(),
    itemCodes,
    serviceEvaluation:
      String(raw.serviceEvaluation || raw.service_evaluation || "").trim() ||
      undefined,
    remark: String(raw.remark || "").trim() || undefined,
  };
}

function emptyRow(): DeviceBlockRow {
  return {
    brand: "迈瑞",
    model: "",
    serialNo: "",
    assayLineCode: "",
    itemCodes: [],
    serviceEvaluation: "",
  };
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

type Props = {
  value: any;
  onChange: (next: DeviceBlockAnswer) => void;
  disabled?: boolean;
};

export function DeviceBlockField({ value, onChange, disabled }: Props) {
  const [tree, setTree] = useState<AssayTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const answer = useMemo(() => normalizeDeviceBlockAnswer(value), [value]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetchAssayTree();
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setTree([]);
      } else {
        setTree(res.items || []);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          添加设备 → 选择所属检测线 → 勾选该检测线下细项；所属公司区分迈瑞 / 竞品。
        </p>
        {!disabled ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDevices([...answer.devices, emptyRow()])}
          >
            <Plus className="mr-1 h-4 w-4" />
            添加设备
          </Button>
        ) : null}
      </div>
      {answer.devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未添加设备。</p>
      ) : null}
      {answer.devices.map((row, index) => {
        const cats = row.assayLineCode
          ? categoriesUnderLine(tree, row.assayLineCode)
          : [];
        const selected = new Set(row.itemCodes);
        return (
          <div
            key={index}
            className="space-y-3 rounded-md border border-dashed p-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">设备 #{index + 1}</p>
              {!disabled ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDevices(answer.devices.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>所属公司</Label>
                <Select
                  value={
                    COMMON_BRANDS.includes(row.brand) ? row.brand : "其它"
                  }
                  disabled={disabled}
                  onValueChange={(v) => {
                    if (v === "其它") {
                      updateRow(index, {
                        brand: row.brand === "迈瑞" || COMMON_BRANDS.includes(row.brand)
                          ? ""
                          : row.brand,
                      });
                    } else {
                      updateRow(index, { brand: v });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择公司" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_BRANDS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!COMMON_BRANDS.includes(row.brand) || row.brand === "" ? (
                  <Input
                    className="mt-1"
                    placeholder="输入公司名称"
                    value={row.brand}
                    disabled={disabled}
                    onChange={(e) =>
                      updateRow(index, { brand: e.target.value })
                    }
                  />
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>所属检测线</Label>
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
              <div className="space-y-1.5">
                <Label>型号</Label>
                <Input
                  value={row.model}
                  disabled={disabled}
                  placeholder="如 BS-2000M / CL-8000"
                  onChange={(e) => updateRow(index, { model: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>序列号（可选）</Label>
                <Input
                  value={row.serialNo || ""}
                  disabled={disabled}
                  onChange={(e) =>
                    updateRow(index, { serialNo: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>客户服务评价</Label>
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
            </div>
            {row.assayLineCode ? (
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">
                    该检测线下细项（已选 {row.itemCodes.length}）
                  </Label>
                  {!disabled && cats.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        const all = leafItemsUnderLine(tree, row.assayLineCode).map(
                          (i) => i.code,
                        );
                        const allSelected = all.every((c) => selected.has(c));
                        updateRow(index, {
                          itemCodes: allSelected ? [] : all,
                        });
                      }}
                    >
                      {leafItemsUnderLine(tree, row.assayLineCode).every((i) =>
                        selected.has(i.code),
                      )
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
                        catSelected === catCodes.length && catCodes.length > 0;
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
                                    catCodes.forEach((c) => set.delete(c));
                                  } else {
                                    catCodes.forEach((c) => set.add(c));
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
                                    toggleItem(index, it.code, e.target.checked)
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
      })}
    </div>
  );
}
