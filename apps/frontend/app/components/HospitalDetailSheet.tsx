"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  fetchAssayTree,
  fetchHospitalAssays,
  getHospital,
  listDevices,
  type AssayTreeNode,
  type Device,
} from "@/lib/business";
import {
  deriveEqaLabel,
  deriveEqaTags,
  fetchEqaFields,
  fetchEqaParticipation,
  fetchEqaParticipations,
  groupEqaItemsByParent,
  scopeLabel,
  type EqaFieldNode,
  type EqaParticipation,
  type EqaParticipationItem,
} from "@/lib/eqa";
import {
  displayValue,
  HOSPITAL_ATTRIBUTE_LABELS,
} from "@/lib/hospital-archive";
import type { Hospital } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface HospitalDetailSheetProps {
  hospitalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Canonical short assay-line keys used for tags + filters. */
const ASSAY_LINE_FILTERS = ["全部", "生化", "免疫", "凝血", "血球"] as const;
type AssayLineShort = (typeof ASSAY_LINE_FILTERS)[number];
type AssayLineKey = Exclude<AssayLineShort, "全部">;

const LINE_TAG_CLASS: Record<AssayLineKey, string> = {
  生化:
    "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
  免疫:
    "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
  凝血:
    "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  血球:
    "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
};

const FILTER_ALL_CLASS =
  "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";

function shortenAssayLine(raw: string | undefined | null): AssayLineKey | "" {
  const s = (raw || "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (
    lower === "biochem" ||
    lower.includes("biochem") ||
    s.includes("生化")
  ) {
    return "生化";
  }
  if (
    lower === "immuno" ||
    lower.includes("immuno") ||
    s.includes("免疫")
  ) {
    return "免疫";
  }
  if (
    lower === "coag" ||
    lower.includes("coag") ||
    s.includes("凝血")
  ) {
    return "凝血";
  }
  if (
    lower === "heme" ||
    lower.includes("heme") ||
    lower.includes("hematol") ||
    s.includes("血球") ||
    s.includes("血常规")
  ) {
    return "血球";
  }
  // Fallback: strip trailing 「项目」
  const stripped = s.replace(/项目$/u, "").trim();
  if (
    stripped === "生化" ||
    stripped === "免疫" ||
    stripped === "凝血" ||
    stripped === "血球"
  ) {
    return stripped;
  }
  return "";
}

function AssayLineTag({
  label,
  className,
}: {
  label: AssayLineKey | string;
  className?: string;
}) {
  const short = shortenAssayLine(label) || label;
  const color =
    short === "生化" ||
    short === "免疫" ||
    short === "凝血" ||
    short === "血球"
      ? LINE_TAG_CLASS[short]
      : "border-transparent bg-secondary text-secondary-foreground";
  return (
    <Badge
      variant="secondary"
      className={cn("font-normal", color, className)}
    >
      {short}
    </Badge>
  );
}

function buildAssayLookups(tree: AssayTreeNode[]) {
  const lineNameByCode = new Map<string, string>();
  const itemToCategory = new Map<string, string>();
  const walk = (
    nodes: AssayTreeNode[],
    lineCode: string,
    lineName: string,
    categoryName: string,
  ) => {
    for (const n of nodes) {
      let lc = lineCode;
      let ln = lineName;
      let cn = categoryName;
      if (n.kind === "line") {
        lc = n.code;
        ln = n.name;
        lineNameByCode.set(n.code, n.name);
      } else if (n.kind === "category") {
        cn = n.name;
      } else if (n.kind === "item" && cn) {
        itemToCategory.set(n.code, cn);
      }
      if (n.children?.length) walk(n.children, lc, ln, cn);
    }
  };
  walk(tree, "", "", "");
  return { lineNameByCode, itemToCategory };
}

function resolveLineRaw(
  device: Device,
  lineNameByCode: Map<string, string>,
): string {
  const code = (device.assayLineCode || device.category || "").trim();
  if (!code) return "";
  return lineNameByCode.get(code) || code;
}

function resolveLineShort(
  device: Device,
  lineNameByCode: Map<string, string>,
): AssayLineKey | "" {
  const code = (device.assayLineCode || device.category || "").trim();
  return (
    shortenAssayLine(code) ||
    shortenAssayLine(lineNameByCode.get(code) || "") ||
    shortenAssayLine(resolveLineRaw(device, lineNameByCode))
  );
}

function resolvePackages(
  itemCodes: string[] | undefined,
  itemToCategory: Map<string, string>,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const code of itemCodes || []) {
    const name = itemToCategory.get(code);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function DeviceCard({
  device,
  lineShort,
  packages,
  variant,
}: {
  device: Device;
  lineShort: AssayLineKey | "";
  packages: string[];
  variant: "own" | "competitor";
}) {
  const shell =
    variant === "competitor"
      ? "rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20"
      : "rounded-lg border bg-background p-3 shadow-sm";
  const coverBorder =
    variant === "competitor"
      ? "mt-2 border-t border-amber-200/50 pt-2 dark:border-amber-900/30"
      : "mt-2 border-t pt-2";

  return (
    <li className={shell}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 font-medium leading-snug">
          {device.brand || "迈瑞"} {device.model}
        </div>
        {lineShort ? <AssayLineTag label={lineShort} className="shrink-0" /> : null}
      </div>
      {device.serialNo ? (
        <div className="mt-0.5 text-xs text-muted-foreground">
          SN {device.serialNo}
        </div>
      ) : null}
      <dl className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
        {device.usageLocation ? (
          <div>
            <dt className="text-muted-foreground">使用位置</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.usageLocation}</dd>
          </div>
        ) : null}
        {device.installedAt ? (
          <div>
            <dt className="text-muted-foreground">安装日期</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.installedAt}</dd>
          </div>
        ) : null}
        {device.enabledAt ? (
          <div>
            <dt className="text-muted-foreground">到期时间</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.enabledAt}</dd>
          </div>
        ) : null}
        {device.serviceEvaluation ? (
          <div>
            <dt className="text-muted-foreground">客户服务评价</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.serviceEvaluation}</dd>
          </div>
        ) : null}
        {device.reagentBrand ? (
          <div>
            <dt className="text-muted-foreground">试剂品牌</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.reagentBrand}</dd>
          </div>
        ) : null}
        {device.monthlySampleVolume ? (
          <div>
            <dt className="text-muted-foreground">月样本量</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.monthlySampleVolume}</dd>
          </div>
        ) : null}
        {device.deptHead ? (
          <div>
            <dt className="text-muted-foreground">科室负责人</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.deptHead}</dd>
          </div>
        ) : null}
        {device.channelCsa ? (
          <div>
            <dt className="text-muted-foreground">渠道CSA</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.channelCsa}</dd>
          </div>
        ) : null}
        {device.status ? (
          <div>
            <dt className="text-muted-foreground">状态</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.status}</dd>
          </div>
        ) : null}
      </dl>
      {packages.length > 0 ? (
        <div className={coverBorder}>
          <div className="mb-1.5 text-xs text-muted-foreground">覆盖套餐</div>
          <div className="flex flex-wrap gap-1.5">
            {packages.map((name) => (
              <Badge key={name} variant="outline" className="font-normal">
                {name}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}

const SECTION_TITLE =
  "text-base font-semibold tracking-tight text-foreground";

export function HospitalDetailSheet({
  hospitalId,
  open,
  onOpenChange,
}: HospitalDetailSheetProps) {
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [assayTree, setAssayTree] = useState<AssayTreeNode[]>([]);
  const [mindrayLines, setMindrayLines] = useState<string[]>([]);
  const [eqaRows, setEqaRows] = useState<EqaParticipation[]>([]);
  const [eqaFields, setEqaFields] = useState<EqaFieldNode[]>([]);
  const [eqaItems, setEqaItems] = useState<Record<number, EqaParticipationItem[]>>({});
  const [eqaDetailLoading, setEqaDetailLoading] = useState(false);
  const [selectedEqaYear, setSelectedEqaYear] = useState<number | null>(null);
  const [lineFilter, setLineFilter] = useState<AssayLineShort>("全部");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !hospitalId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setLineFilter("全部");
      const [hRes, dRes, aRes, eRes, fRes, tRes] = await Promise.all([
        getHospital(hospitalId),
        listDevices(hospitalId),
        fetchHospitalAssays(hospitalId),
        fetchEqaParticipations({ hospitalId, page: 1, pageSize: 50 }),
        fetchEqaFields(),
        fetchAssayTree(),
      ]);
      if (cancelled) return;
      if (hRes.error) {
        setError(hRes.error);
        setHospital(null);
        setDevices([]);
        setAssayTree([]);
        setMindrayLines([]);
        setEqaRows([]);
        setEqaFields([]);
        setEqaItems({});
        setSelectedEqaYear(null);
      } else {
        setHospital(hRes.hospital || null);
        setDevices(dRes.items);
        setAssayTree(tRes.items || []);
        setMindrayLines(aRes.mindrayLines || []);
        const rows = eRes.data?.items || [];
        setEqaRows(rows);
        setEqaFields(fRes.data?.items || []);
        setEqaItems({});
        const years = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => b - a);
        setSelectedEqaYear(years[0] ?? null);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, hospitalId]);

  const { lineNameByCode, itemToCategory } = useMemo(
    () => buildAssayLookups(assayTree),
    [assayTree],
  );

  const mindrayCoverageShort = useMemo(() => {
    const out: AssayLineKey[] = [];
    const seen = new Set<string>();
    for (const raw of mindrayLines) {
      const short = shortenAssayLine(raw);
      if (!short || seen.has(short)) continue;
      seen.add(short);
      out.push(short);
    }
    return out;
  }, [mindrayLines]);

  /** Split hospital devices: 迈瑞 = 自有, others = 竞品. */
  const { ownDevices, competitorDevices } = useMemo(() => {
    const own: Device[] = [];
    const comps: Device[] = [];
    for (const d of devices) {
      const brand = (d.brand || "迈瑞").trim();
      if (brand === "迈瑞") own.push(d);
      else comps.push(d);
    }
    return { ownDevices: own, competitorDevices: comps };
  }, [devices]);

  const filterByLine = (list: Device[]) => {
    if (lineFilter === "全部") return list;
    return list.filter(
      (d) => resolveLineShort(d, lineNameByCode) === lineFilter,
    );
  };

  const filteredOwn = useMemo(
    () => filterByLine(ownDevices),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownDevices, lineFilter, lineNameByCode],
  );
  const filteredCompetitors = useMemo(
    () => filterByLine(competitorDevices),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [competitorDevices, lineFilter, lineNameByCode],
  );

  /** Group participation rows by year (desc); derive per-year EQA label from scopes. */
  const eqaYears = useMemo(() => {
    type YearGroup = {
      year: number;
      label: string;
      rows: EqaParticipation[];
      hasNational: boolean;
      hasProvincial: boolean;
    };
    const map = new Map<number, YearGroup>();
    for (const row of eqaRows || []) {
      let g = map.get(row.year);
      if (!g) {
        g = {
          year: row.year,
          label: "",
          rows: [],
          hasNational: false,
          hasProvincial: false,
        };
        map.set(row.year, g);
      }
      g.rows.push(row);
      if (row.scope === "national") g.hasNational = true;
      if (row.scope === "provincial") g.hasProvincial = true;
    }
    const out = Array.from(map.values()).sort((a, b) => b.year - a.year);
    for (const g of out) {
      g.label = deriveEqaLabel(g.hasNational, g.hasProvincial);
      g.rows.sort((a, b) => {
        const order = (s: string) => (s === "national" ? 0 : s === "provincial" ? 1 : 2);
        return order(a.scope) - order(b.scope);
      });
    }
    return out;
  }, [eqaRows]);

  const activeEqaYear = useMemo(() => {
    if (!eqaYears.length) return null;
    if (selectedEqaYear != null && eqaYears.some((y) => y.year === selectedEqaYear)) {
      return eqaYears.find((y) => y.year === selectedEqaYear) || eqaYears[0];
    }
    return eqaYears[0];
  }, [eqaYears, selectedEqaYear]);

  /** Always show subjects expanded: prefetch items for the active year. */
  useEffect(() => {
    if (!activeEqaYear?.rows?.length) return;
    let cancelled = false;
    const missing = activeEqaYear.rows.filter((r) => !eqaItems[r.id]);
    if (!missing.length) return;
    setEqaDetailLoading(true);
    (async () => {
      try {
        const results = await Promise.all(
          missing.map(async (r) => {
            const res = await fetchEqaParticipation(r.id);
            return [r.id, res.data?.participation?.items || []] as const;
          }),
        );
        if (cancelled) return;
        setEqaItems((s) => {
          const next = { ...s };
          for (const [id, items] of results) next[id] = items;
          return next;
        });
      } finally {
        if (!cancelled) setEqaDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eqaItems intentionally omitted: only refetch missing when year/rows change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEqaYear]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border bg-card p-0 text-card-foreground shadow-xl sm:max-w-none">
        <DialogHeader className="shrink-0 border-b bg-muted/30 px-4 py-3 text-left md:px-5 md:py-4">
          <DialogTitle className="pr-8 text-base">
            {hospital?.name || "客户档案"}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>
              {hospital
                ? `${hospital.province} · ${hospital.city}`
                : "客户档案详情"}
            </span>
            {hospital ? (
              <Badge variant="outline" className="text-[10px]">
                {hospital.level}
              </Badge>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 text-sm md:px-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <>
            <section className="space-y-3">
              <h3 className={SECTION_TITLE}>客户基础</h3>
              <div className="grid divide-y rounded-lg border bg-background md:grid-cols-2 md:divide-x md:divide-y-0">
                {[
                  { label: "客户名称", value: hospital?.name || "" },
                  { label: "客户编码", value: hospital?.customerCode || "" },
                  { label: "区域", value: hospital?.region || "" },
                  { label: "分公司", value: hospital?.branchOffice || "" },
                  {
                    label: HOSPITAL_ATTRIBUTE_LABELS.customer_level || "客户等级",
                    value: hospital?.attributes?.customer_level || "",
                  },
                  {
                    label: HOSPITAL_ATTRIBUTE_LABELS.customer_stage || "客户所在阶段",
                    value: hospital?.attributes?.customer_stage || "",
                  },
                  {
                    label:
                      HOSPITAL_ATTRIBUTE_LABELS.pending_issues ||
                      "客户端待解决问题及需求",
                    value: hospital?.attributes?.pending_issues || "",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex flex-col gap-1 border-b px-3 py-3 text-sm last:border-b-0 md:grid md:grid-cols-[8rem_1fr] md:gap-3 md:border-b md:px-4 md:odd:border-r"
                  >
                    <div className="text-xs text-muted-foreground md:text-sm">
                      {row.label}
                    </div>
                    <div className="break-words whitespace-pre-wrap text-foreground">
                      {displayValue(row.value)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border bg-background px-3 py-3 md:px-4">
                <div className="mb-2 text-xs text-muted-foreground">
                  迈瑞覆盖检测线
                </div>
                {mindrayCoverageShort.length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无覆盖记录</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {mindrayCoverageShort.map((n) => (
                      <AssayLineTag key={n} label={n} />
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={SECTION_TITLE}>设备与竞品</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ASSAY_LINE_FILTERS.map((f) => {
                    const active = lineFilter === f;
                    const color =
                      f === "全部" ? FILTER_ALL_CLASS : LINE_TAG_CLASS[f];
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setLineFilter(f)}
                        className={cn(
                          "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                          color,
                          active
                            ? "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background"
                            : "opacity-90 hover:opacity-100",
                        )}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-foreground">自有设备</h4>
                  <Badge variant="outline" className="font-normal">
                    {filteredOwn.length}
                    {lineFilter !== "全部" ? ` / ${ownDevices.length}` : ""}
                  </Badge>
                </div>
                {filteredOwn.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
                    {ownDevices.length === 0
                      ? "暂无自有设备记录"
                      : `当前筛选「${lineFilter}」下暂无自有设备`}
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {filteredOwn.map((d) => (
                      <DeviceCard
                        key={d.id}
                        device={d}
                        lineShort={resolveLineShort(d, lineNameByCode)}
                        packages={resolvePackages(d.itemCodes, itemToCategory)}
                        variant="own"
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-foreground">竞品设备</h4>
                  <Badge variant="outline" className="font-normal">
                    {filteredCompetitors.length}
                    {lineFilter !== "全部"
                      ? ` / ${competitorDevices.length}`
                      : ""}
                  </Badge>
                </div>
                {filteredCompetitors.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
                    {competitorDevices.length === 0
                      ? "暂无同检测线竞品设备"
                      : `当前筛选「${lineFilter}」下暂无竞品设备`}
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {filteredCompetitors.map((d) => (
                      <DeviceCard
                        key={d.id}
                        device={d}
                        lineShort={resolveLineShort(d, lineNameByCode)}
                        packages={resolvePackages(d.itemCodes, itemToCategory)}
                        variant="competitor"
                      />
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className={SECTION_TITLE}>室间质评</h3>
              <div className="rounded-lg border bg-background text-sm">
                {eqaYears.length === 0 ? (
                  <div className="px-3 py-3 text-muted-foreground md:px-4">
                    暂无 EQA 参评记录（按年采集国家/省级科目）
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 md:px-4">
                      <span className="text-xs text-muted-foreground">参评年份</span>
                      <div className="flex flex-wrap gap-1.5">
                        {eqaYears.map((y) => {
                          const active = activeEqaYear?.year === y.year;
                          return (
                            <button
                              key={y.year}
                              type="button"
                              className={
                                active
                                  ? "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                                  : "rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50"
                              }
                              onClick={() => setSelectedEqaYear(y.year)}
                            >
                              {y.year}
                            </button>
                          );
                        })}
                      </div>
                      {activeEqaYear
                        ? deriveEqaTags(
                            activeEqaYear.hasNational,
                            activeEqaYear.hasProvincial,
                          ).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="font-normal"
                            >
                              {tag}
                            </Badge>
                          ))
                        : null}
                    </div>
                    {activeEqaYear ? (
                      <ul className="divide-y">
                        {activeEqaYear.rows.map((row) => {
                          const items = eqaItems[row.id];
                          const groups = groupEqaItemsByParent(items, eqaFields);
                          return (
                            <li key={row.id} className="px-3 py-2.5 md:px-4">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="font-medium">
                                  {scopeLabel(row.scope)}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="shrink-0 font-normal"
                                >
                                  {row.itemCount} 科
                                </Badge>
                              </div>
                              <div className="space-y-2">
                                {items == null ? (
                                  <span className="text-xs text-muted-foreground">
                                    {eqaDetailLoading ? "加载中…" : "加载中…"}
                                  </span>
                                ) : !items.length ? (
                                  <span className="text-xs text-muted-foreground">
                                    无勾选科目
                                  </span>
                                ) : (
                                  groups.map((g) => (
                                    <div key={g.parentCode} className="space-y-1.5">
                                      <div className="text-xs font-medium text-muted-foreground">
                                        {g.parentName}
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {g.items.map((it) => (
                                          <Badge
                                            key={it.fieldCode}
                                            variant="outline"
                                            className="font-normal"
                                          >
                                            {it.fieldName || it.fieldCode}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
            </section>

            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
