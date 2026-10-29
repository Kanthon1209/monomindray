"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Search, ClipboardList, Columns2, ChevronRight, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HospitalDetailSheet } from "./HospitalDetailSheet";
import type { Hospital } from "@/lib/types";
import type { AssayPackage } from "@/lib/assay-packages";
import { packageChipClass } from "@/lib/assay-packages";
import {
  DASHBOARD_EXTRA_COLUMNS,
  DASHBOARD_PRIMARY_COLUMNS,
  archiveFieldLabel,
  displayValue,
  formatMatchingRate,
  parseNumericField,
  resolveArchiveField,
  type ArchiveFieldKey,
} from "@/lib/hospital-archive";
import { cn, filterChipSelectedClass } from "@/lib/utils";

interface HospitalPanelProps {
  hospitals: Hospital[];
  selectedProvince?: string;
  modelFilter?: string;
  levelFilter?: string;
  packages?: AssayPackage[];
  packageCounts?: Record<string, number>;
  selectedPackageCode?: string;
  onPackageChange?: (code: string) => void;
  deviceBrandOptions?: { brand: string; count: number }[];
  selectedDeviceBrands?: string[];
  onDeviceBrandsChange?: (brands: string[]) => void;
  totalHospitalCount?: number;
}

export function HospitalPanel({
  hospitals,
  selectedProvince,
  modelFilter = "all",
  levelFilter = "all",
  packages = [],
  packageCounts = {},
  selectedPackageCode = "",
  onPackageChange,
  deviceBrandOptions = [],
  selectedDeviceBrands = [],
  onDeviceBrandsChange,
  totalHospitalCount,
}: HospitalPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedCols, setExpandedCols] = useState(false);
  /** 套餐筛选区默认收起 */
  const [packageFilterOpen, setPackageFilterOpen] = useState(false);
  /** 设备公司筛选区默认收起 */
  const [deviceBrandFilterOpen, setDeviceBrandFilterOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const columns = useMemo(
    () =>
      expandedCols
        ? [...DASHBOARD_PRIMARY_COLUMNS, ...DASHBOARD_EXTRA_COLUMNS]
        : DASHBOARD_PRIMARY_COLUMNS,
    [expandedCols],
  );

  /** Group 套餐 chips by 检测线 for one-row-per-line layout */
  const packagesByLine = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { lineCode: string; lineName: string; packages: AssayPackage[] }>();
    for (const pkg of packages) {
      const key = pkg.lineCode || pkg.lineName;
      if (!map.has(key)) {
        order.push(key);
        map.set(key, { lineCode: pkg.lineCode, lineName: pkg.lineName, packages: [] });
      }
      map.get(key)!.packages.push(pkg);
    }
    return order.map((k) => map.get(k)!);
  }, [packages]);

  const selectedPackage = useMemo(
    () => packages.find((x) => x.code === selectedPackageCode) || null,
    [packages, selectedPackageCode],
  );

  const filtered = useMemo(() => {
    const lower = searchQuery.trim().toLowerCase();
    const brandFilterActive = selectedDeviceBrands.length > 0;
    const brandSet = brandFilterActive ? new Set(selectedDeviceBrands) : null;
    return hospitals.filter((h) => {
      const customerName = resolveArchiveField(h, "customerName");
      const model = resolveArchiveField(h, "model");
      const level = resolveArchiveField(h, "customerLevel");
      if (modelFilter !== "all" && model !== modelFilter) return false;
      if (levelFilter !== "all" && level !== levelFilter) return false;
      if (brandSet) {
        const hospitalBrands = h.deviceBrands || [];
        if (!hospitalBrands.some((b) => brandSet.has(b))) return false;
      }
      if (!lower) return true;
      return (
        customerName.toLowerCase().includes(lower) ||
        h.name.toLowerCase().includes(lower) ||
        h.city.toLowerCase().includes(lower) ||
        model.toLowerCase().includes(lower) ||
        resolveArchiveField(h, "branchOffice").toLowerCase().includes(lower)
      );
    });
  }, [hospitals, searchQuery, modelFilter, levelFilter, selectedDeviceBrands]);

  useEffect(() => {
    if (selectedId && !filtered.some((h) => h.id === selectedId)) {
      setSelectedId(null);
      setDetailOpen(false);
    }
  }, [filtered, selectedId]);

  const summary = useMemo(() => {
    let withModel = 0;
    let rateSum = 0;
    let rateCount = 0;
    let mindraySamples = 0;
    for (const h of filtered) {
      if (resolveArchiveField(h, "model")) withModel += 1;
      const rate = parseNumericField(resolveArchiveField(h, "matchingRate"));
      if (rate != null) {
        rateSum += rate <= 1 ? rate * 100 : rate;
        rateCount += 1;
      }
      const ms = parseNumericField(resolveArchiveField(h, "mindraySampleVolume"));
      if (ms != null) mindraySamples += ms;
    }
    return {
      total: filtered.length,
      withModel,
      avgRate: rateCount ? `${(rateSum / rateCount).toFixed(1)}%` : "—",
      mindraySamples: mindraySamples
        ? Math.round(mindraySamples).toLocaleString()
        : "—",
    };
  }, [filtered]);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  const cellValue = (h: Hospital, key: ArchiveFieldKey | "customerLevel" | "assays") => {
    if (key === "assays") {
      const names = h.assayNames || [];
      return names.length ? names.join("、") : "—";
    }
    const raw = resolveArchiveField(h, key as ArchiveFieldKey);
    if (key === "matchingRate") return formatMatchingRate(raw);
    // Empty customer level: blank (no "—"); hide in list / badge when unset.
    if (key === "customerLevel") {
      const v = (raw || "").trim();
      if (!v || v === "-" || v === "—") return "";
      return v;
    }
    return displayValue(raw);
  };

  /** List column: fixed-height chip row; overflow scrolls horizontally on hover. */
  const renderAssayCategories = (h: Hospital) => {
    const names = (h.assayNames || []).filter(Boolean);
    if (!names.length) {
      return <span className="text-muted-foreground">—</span>;
    }
    return (
      <div
        className={cn(
          "flex h-7 max-w-full flex-nowrap items-center gap-1 overflow-x-hidden overflow-y-hidden",
          "hover:overflow-x-auto",
        )}
        title={names.join("、")}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth <= el.clientWidth) return;
          el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {names.map((n) => (
          <Badge
            key={n}
            variant="secondary"
            className="h-6 max-w-[9rem] shrink-0 truncate font-normal"
            title={n}
          >
            {n}
          </Badge>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background md:border-l">
      <div className="shrink-0 space-y-3 px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">医院列表</h2>
            <Badge variant="secondary">{summary.total}</Badge>
            {selectedProvince ? (
              <Badge variant="outline">{selectedProvince}</Badge>
            ) : null}
          </div>
          <Button size="sm" variant="default" className="shrink-0" asChild>
            <Link href="/dashboard/surveys/campaigns">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">去采集</span>
            </Link>
          </Button>
        </div>

        <div className="hidden flex-wrap gap-2 md:flex">
          <Badge variant="outline" className="font-normal">
            有机型{" "}
            <span className="ml-1 font-medium text-foreground">
              {summary.withModel}
            </span>
          </Badge>
          <Badge variant="outline" className="font-normal">
            均配套率{" "}
            <span className="ml-1 font-medium text-foreground">
              {summary.avgRate}
            </span>
          </Badge>
          <Badge variant="outline" className="font-normal">
            标本量{" "}
            <span className="ml-1 font-medium text-foreground">
              {summary.mindraySamples}
            </span>
          </Badge>
        </div>

        {packages.length > 0 && onPackageChange ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setPackageFilterOpen((v) => !v)}
                aria-expanded={packageFilterOpen}
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    packageFilterOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
                按套餐筛选
                {selectedPackage ? (
                  <Badge variant="outline" className="ml-1 h-5 font-normal">
                    {selectedPackage.lineName} · {selectedPackage.name}
                  </Badge>
                ) : null}
              </button>
              <div className="flex items-center gap-2">
                {selectedPackageCode ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => onPackageChange("")}
                  >
                    清除筛选
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setPackageFilterOpen((v) => !v)}
                >
                  {packageFilterOpen ? "收起" : "展开"}
                </button>
              </div>
            </div>

            {packageFilterOpen ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onPackageChange("")}
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                      !selectedPackageCode
                        ? filterChipSelectedClass
                        : "opacity-90 hover:opacity-100",
                    )}
                  >
                    全部
                    <span className="ml-1 tabular-nums opacity-80">
                      {totalHospitalCount ?? hospitals.length}
                    </span>
                  </button>
                </div>
                {packagesByLine.map((line) => (
                  <div
                    key={line.lineCode || line.lineName}
                    className="flex min-w-0 items-center gap-2"
                  >
                    <span
                      className="w-14 shrink-0 truncate text-[11px] font-medium text-muted-foreground"
                      title={line.lineName}
                    >
                      {line.lineName}
                    </span>
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto py-0.5",
                      )}
                      onWheel={(e) => {
                        const el = e.currentTarget;
                        if (el.scrollWidth <= el.clientWidth) return;
                        el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      {line.packages.map((pkg) => {
                        const active = selectedPackageCode === pkg.code;
                        const count = packageCounts[pkg.code] ?? 0;
                        return (
                          <button
                            key={pkg.code}
                            type="button"
                            title={`${pkg.lineName} · ${pkg.name}（${count} 家）`}
                            onClick={() =>
                              onPackageChange(active ? "" : pkg.code)
                            }
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                              packageChipClass(pkg),
                              active
                                ? filterChipSelectedClass
                                : "opacity-90 hover:opacity-100",
                              count === 0 ? "opacity-50" : "",
                            )}
                          >
                            <span className="whitespace-nowrap">{pkg.name}</span>
                            <span className="shrink-0 tabular-nums opacity-80">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedPackage ? (
              <div className="rounded-md border bg-muted/40 px-2.5 py-2">
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  {selectedPackage.lineName} · {selectedPackage.name} · 细项{" "}
                  {selectedPackage.items.length}
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedPackage.items.length === 0 ? (
                    <span className="text-xs text-muted-foreground">暂无细项</span>
                  ) : (
                    selectedPackage.items.map((it) => (
                      <Badge
                        key={it.code}
                        variant="outline"
                        className="h-6 font-normal"
                        title={it.code}
                      >
                        {it.name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {onDeviceBrandsChange ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setDeviceBrandFilterOpen((v) => !v)}
                aria-expanded={deviceBrandFilterOpen}
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    deviceBrandFilterOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
                按设备公司筛选
                {selectedDeviceBrands.length > 0 ? (
                  <Badge variant="outline" className="ml-1 h-5 max-w-[12rem] truncate font-normal">
                    {selectedDeviceBrands.length === 1
                      ? selectedDeviceBrands[0]
                      : `已选 ${selectedDeviceBrands.length} 家公司`}
                  </Badge>
                ) : null}
              </button>
              <div className="flex items-center gap-2">
                {selectedDeviceBrands.length > 0 ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => onDeviceBrandsChange([])}
                  >
                    清除筛选
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setDeviceBrandFilterOpen((v) => !v)}
                >
                  {deviceBrandFilterOpen ? "收起" : "展开"}
                </button>
              </div>
            </div>

            {deviceBrandFilterOpen ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onDeviceBrandsChange([])}
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                      selectedDeviceBrands.length === 0
                        ? filterChipSelectedClass
                        : "opacity-90 hover:opacity-100",
                    )}
                  >
                    全部
                    <span className="ml-1 tabular-nums opacity-80">
                      {totalHospitalCount ?? hospitals.length}
                    </span>
                  </button>
                </div>
                {deviceBrandOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无设备公司数据</p>
                ) : (
                  <div
                    className={cn(
                      "flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto py-0.5",
                    )}
                    onWheel={(e) => {
                      const el = e.currentTarget;
                      if (el.scrollWidth <= el.clientWidth) return;
                      el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    {deviceBrandOptions.map(({ brand, count }) => {
                      const active = selectedDeviceBrands.includes(brand);
                      return (
                        <button
                          key={brand}
                          type="button"
                          title={`${brand}（${count} 家）`}
                          onClick={() => {
                            if (active) {
                              onDeviceBrandsChange(
                                selectedDeviceBrands.filter((b) => b !== brand),
                              );
                            } else {
                              onDeviceBrandsChange([...selectedDeviceBrands, brand]);
                            }
                          }}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                            "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                            active
                              ? filterChipSelectedClass
                              : "opacity-90 hover:opacity-100",
                            count === 0 ? "opacity-50" : "",
                          )}
                        >
                          <span className="max-w-[10rem] truncate whitespace-nowrap">
                            {brand}
                          </span>
                          <span className="shrink-0 tabular-nums opacity-80">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索医院、城市、机型…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-8 md:h-9"
            />
          </div>
          <Button
            size="sm"
            variant={expandedCols ? "secondary" : "outline"}
            className="hidden h-9 shrink-0 md:inline-flex"
            onClick={() => setExpandedCols((v) => !v)}
          >
            <Columns2 className="h-4 w-4" />
            {expandedCols ? "收起" : "更多列"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* 手机：卡片列表 */}
      <div className="min-h-0 flex-1 overflow-auto md:hidden">
        {filtered.length === 0 ? (
          <div className="flex h-40 items-center justify-center px-4 text-sm text-muted-foreground">
            暂无匹配医院
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((hospital) => {
              const name = cellValue(hospital, "customerName");
              const level = cellValue(hospital, "customerLevel");
              const region = cellValue(hospital, "region");
              const branch = cellValue(hospital, "branchOffice");
              const active = selectedId === hospital.id && detailOpen;
              return (
                <li key={hospital.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-3.5 text-left transition-colors active:bg-accent",
                      active && "bg-muted",
                    )}
                    onClick={() => openDetail(hospital.id)}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[15px] font-medium leading-snug">
                          {name}
                        </span>
                        {level ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 font-normal"
                          >
                            {level}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {region !== "—" ? <span>{region}</span> : null}
                        {branch !== "—" ? <span>{branch}</span> : null}
                      </div>
                      {(hospital.assayNames || []).length ? (
                        <div className="pt-0.5">{renderAssayCategories(hospital)}</div>
                      ) : null}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 桌面：表格 */}
      <div className="relative hidden min-h-0 flex-1 md:block">
        <div className="absolute inset-0 overflow-auto">
          <table
            className={cn(
              "w-full caption-bottom text-sm",
              expandedCols && "min-w-[920px]",
            )}
          >
            <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_var(--border)]">
              <TableRow className="hover:bg-transparent">
                {columns.map((key) => (
                  <TableHead
                    key={key}
                    className="h-10 whitespace-nowrap px-3 text-xs"
                  >
                    {archiveFieldLabel(key)}
                  </TableHead>
                ))}
                <TableHead className="h-10 w-8 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length + 1}
                    className="h-36 text-center text-sm text-muted-foreground"
                  >
                    暂无匹配医院
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((hospital) => {
                  const active = selectedId === hospital.id && detailOpen;
                  const hovered = hoveredId === hospital.id;
                  return (
                    <TableRow
                      key={hospital.id}
                      data-state={active ? "selected" : undefined}
                      className={cn(
                        "group cursor-pointer border-b",
                        "hover:bg-accent/60",
                        active && "bg-muted",
                      )}
                      onClick={() => openDetail(hospital.id)}
                      onMouseEnter={() => setHoveredId(hospital.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      {columns.map((key) => (
                        <TableCell
                          key={key}
                          className={cn(
                            "max-w-[160px] px-3 py-3 text-sm",
                            key !== "assays" && "truncate",
                            key === "customerName" && "font-medium",
                            key === "assays" && "max-w-[280px]",
                            key === "customerCode" && "font-mono text-xs text-muted-foreground",
                          )}
                          title={key === "assays" ? cellValue(hospital, key) : cellValue(hospital, key)}
                        >
                          {key === "assays"
                            ? renderAssayCategories(hospital)
                            : cellValue(hospital, key)}
                        </TableCell>
                      ))}
                      <TableCell className="w-8 px-2 py-3">
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-opacity",
                            hovered || active
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </table>
        </div>
      </div>

      <Separator className="hidden md:block" />

      <div className="hidden shrink-0 items-center px-4 py-3 md:flex">
        <span className="text-xs text-muted-foreground">
          共 {filtered.length} 家
        </span>
      </div>

      <HospitalDetailSheet
        hospitalId={selectedId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
