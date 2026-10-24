"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  fetchHospitalAssays,
  getHospital,
  listDevices,
  type Device,
  type HospitalAssayCompetitorCategory,
} from "@/lib/business";
import {
  deriveEqaLabel,
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

interface HospitalDetailSheetProps {
  hospitalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function deviceLineLabel(d: Device): string {
  return d.assayLineCode || d.category || "";
}

function DeviceCard({ device }: { device: Device }) {
  const line = deviceLineLabel(device);
  const itemCount = device.itemCodes?.length || 0;
  return (
    <li className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium leading-snug">
            {device.brand || "迈瑞"} {device.model}
          </div>
          {device.serialNo ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              SN {device.serialNo}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {line ? (
            <Badge variant="outline" className="font-normal">
              {line}
            </Badge>
          ) : null}
          {itemCount > 0 ? (
            <Badge variant="secondary" className="font-normal">
              {itemCount} 细项
            </Badge>
          ) : null}
        </div>
      </div>
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
            <dt className="text-muted-foreground">启用日期</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.enabledAt}</dd>
          </div>
        ) : null}
        {device.serviceEvaluation ? (
          <div>
            <dt className="text-muted-foreground">客户服务评价</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.serviceEvaluation}</dd>
          </div>
        ) : null}
        {device.status ? (
          <div>
            <dt className="text-muted-foreground">状态</dt>
            <dd className="mt-0.5 text-sm text-foreground">{device.status}</dd>
          </div>
        ) : null}
      </dl>
      {itemCount > 0 ? (
        <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
          细项覆盖：已勾选 {itemCount} 项
        </div>
      ) : null}
    </li>
  );
}

type FlatCompetitor = {
  key: string;
  brand: string;
  model: string;
  serialNo: string;
  usageLocation: string;
  installedAt: string;
  enabledAt: string;
  serviceEvaluation: string;
  status: string;
  assayLine: string;
  lineName: string;
  categoryName: string;
  itemNames: string[];
  itemCount: number;
};

export function HospitalDetailSheet({
  hospitalId,
  open,
  onOpenChange,
}: HospitalDetailSheetProps) {
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [competitors, setCompetitors] = useState<HospitalAssayCompetitorCategory[]>([]);
  const [mindrayLines, setMindrayLines] = useState<string[]>([]);
  const [eqaRows, setEqaRows] = useState<EqaParticipation[]>([]);
  const [eqaFields, setEqaFields] = useState<EqaFieldNode[]>([]);
  const [openEqa, setOpenEqa] = useState<Record<number, boolean>>({});
  const [eqaItems, setEqaItems] = useState<Record<number, EqaParticipationItem[]>>({});
  const [eqaDetailLoading, setEqaDetailLoading] = useState<number | null>(null);
  const [selectedEqaYear, setSelectedEqaYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !hospitalId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const [hRes, dRes, aRes, eRes, fRes] = await Promise.all([
        getHospital(hospitalId),
        listDevices(hospitalId),
        fetchHospitalAssays(hospitalId),
        fetchEqaParticipations({ hospitalId, page: 1, pageSize: 50 }),
        fetchEqaFields(),
      ]);
      if (cancelled) return;
      if (hRes.error) {
        setError(hRes.error);
        setHospital(null);
        setDevices([]);
        setCompetitors([]);
        setMindrayLines([]);
        setEqaRows([]);
        setEqaFields([]);
        setOpenEqa({});
        setEqaItems({});
        setSelectedEqaYear(null);
      } else {
        setHospital(hRes.hospital || null);
        setDevices(dRes.items);
        setCompetitors(aRes.competitors || []);
        setMindrayLines(aRes.mindrayLines || []);
        const rows = eRes.data?.items || [];
        setEqaRows(rows);
        setEqaFields(fRes.data?.items || []);
        setOpenEqa({});
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

  /** Split hospital devices: 迈瑞 = 自有, others = 竞品. Enrich 竞品 with assay item names. */
  const { ownDevices, competitorDevices } = useMemo(() => {
    const own: Device[] = [];
    const comps: Device[] = [];
    for (const d of devices) {
      const brand = (d.brand || "迈瑞").trim();
      if (brand === "迈瑞") own.push(d);
      else comps.push(d);
    }
    // Map deviceId -> item names / line-category labels from assays competitors payload
    const metaById = new Map<
      string,
      { itemNames: string[]; lineName: string; categoryName: string }
    >();
    for (const cat of competitors) {
      for (const dev of cat.devices || []) {
        const id = String(dev.deviceId);
        const prev = metaById.get(id);
        const names = [...(prev?.itemNames || [])];
        for (const n of dev.itemNames || []) {
          if (!names.includes(n)) names.push(n);
        }
        metaById.set(id, {
          itemNames: names,
          lineName: prev?.lineName || cat.lineName || "",
          categoryName: prev?.categoryName || cat.name || "",
        });
      }
    }
    const competitorCards: FlatCompetitor[] = comps.map((d) => {
      const meta = metaById.get(String(d.id));
      return {
        key: d.id,
        brand: d.brand || "",
        model: d.model || "",
        serialNo: d.serialNo || "",
        usageLocation: d.usageLocation || "",
        installedAt: d.installedAt || "",
        enabledAt: d.enabledAt || "",
        serviceEvaluation: d.serviceEvaluation || "",
        status: d.status || "",
        assayLine: d.assayLineCode || d.category || "",
        lineName: meta?.lineName || "",
        categoryName: meta?.categoryName || "",
        itemNames: meta?.itemNames || [],
        itemCount: d.itemCodes?.length || 0,
      };
    });
    return { ownDevices: own, competitorDevices: competitorCards };
  }, [devices, competitors]);

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

  const toggleEqa = async (id: number) => {
    const willOpen = !openEqa[id];
    setOpenEqa((s) => ({ ...s, [id]: willOpen }));
    if (!willOpen || eqaItems[id]) return;
    setEqaDetailLoading(id);
    const res = await fetchEqaParticipation(id);
    setEqaDetailLoading(null);
    setEqaItems((s) => ({
      ...s,
      [id]: res.data?.participation?.items || [],
    }));
  };

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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 md:px-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <>
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
                客户基础
              </h3>
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
                    label: HOSPITAL_ATTRIBUTE_LABELS.dual_major || "双大客户",
                    value: hospital?.attributes?.dual_major || "",
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
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
                  设备与竞品
                </h3>
                {mindrayLines.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">迈瑞覆盖检测线</span>
                    {mindrayLines.map((n) => (
                      <Badge key={n} variant="secondary" className="font-normal">
                        {n}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">自有设备</h4>
                  <Badge variant="outline" className="font-normal">
                    {ownDevices.length}
                  </Badge>
                </div>
                {ownDevices.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
                    暂无自有设备记录
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {ownDevices.map((d) => (
                      <DeviceCard key={d.id} device={d} />
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">竞品设备</h4>
                  <Badge variant="outline" className="font-normal">
                    {competitorDevices.length}
                  </Badge>
                </div>
                {competitorDevices.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
                    暂无同检测线竞品设备
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {competitorDevices.map((dev) => (
                      <li
                        key={dev.key}
                        className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium leading-snug">
                              {dev.brand} {dev.model}
                            </div>
                            {dev.serialNo ? (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                SN {dev.serialNo}
                              </div>
                            ) : null}
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {[dev.lineName || dev.assayLine, dev.categoryName]
                                .filter(Boolean)
                                .join(" · ") || "竞品"}
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Badge variant="outline" className="font-normal">
                              竞品
                            </Badge>
                            {dev.itemCount > 0 ? (
                              <Badge variant="secondary" className="font-normal">
                                {dev.itemCount} 细项
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <dl className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
                          {dev.usageLocation ? (
                            <div>
                              <dt className="text-muted-foreground">使用位置</dt>
                              <dd className="mt-0.5 text-sm text-foreground">
                                {dev.usageLocation}
                              </dd>
                            </div>
                          ) : null}
                          {dev.installedAt ? (
                            <div>
                              <dt className="text-muted-foreground">安装日期</dt>
                              <dd className="mt-0.5 text-sm text-foreground">
                                {dev.installedAt}
                              </dd>
                            </div>
                          ) : null}
                          {dev.enabledAt ? (
                            <div>
                              <dt className="text-muted-foreground">启用日期</dt>
                              <dd className="mt-0.5 text-sm text-foreground">
                                {dev.enabledAt}
                              </dd>
                            </div>
                          ) : null}
                          {dev.serviceEvaluation ? (
                            <div>
                              <dt className="text-muted-foreground">客户服务评价</dt>
                              <dd className="mt-0.5 text-sm text-foreground">
                                {dev.serviceEvaluation}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                        {dev.itemNames.length > 0 ? (
                          <div className="mt-3 border-t border-amber-200/50 pt-2 dark:border-amber-900/30">
                            <div className="mb-1.5 text-xs text-muted-foreground">
                              细项覆盖（{dev.itemNames.length}）
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {dev.itemNames.slice(0, 12).map((name) => (
                                <Badge
                                  key={name}
                                  variant="outline"
                                  className="font-normal"
                                >
                                  {name}
                                </Badge>
                              ))}
                              {dev.itemNames.length > 12 ? (
                                <span className="text-xs text-muted-foreground">
                                  +{dev.itemNames.length - 12}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
                室间质评
              </h3>
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
                      {activeEqaYear?.label ? (
                        <Badge variant="secondary" className="font-normal">
                          {activeEqaYear.label}
                        </Badge>
                      ) : null}
                    </div>
                    {activeEqaYear ? (
                      <div className="space-y-0 divide-y">
                        <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-2 md:px-4">
                          <div className="rounded-md border bg-muted/10 px-3 py-2">
                            <div className="text-xs text-muted-foreground">派生标签</div>
                            <div className="mt-0.5 font-medium">
                              {activeEqaYear.label || "—"}
                            </div>
                          </div>
                          <div className="rounded-md border bg-muted/10 px-3 py-2">
                            <div className="text-xs text-muted-foreground">参评级别</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {activeEqaYear.hasNational ? (
                                <Badge variant="outline" className="font-normal">
                                  国考
                                </Badge>
                              ) : null}
                              {activeEqaYear.hasProvincial ? (
                                <Badge variant="outline" className="font-normal">
                                  省考
                                </Badge>
                              ) : null}
                              {!activeEqaYear.hasNational && !activeEqaYear.hasProvincial ? (
                                <span className="text-muted-foreground">—</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <ul className="divide-y">
                          {activeEqaYear.rows.map((row) => {
                            const isOpen = !!openEqa[row.id];
                            const items = eqaItems[row.id];
                            const groups = isOpen
                              ? groupEqaItemsByParent(items, eqaFields)
                              : [];
                            return (
                              <li key={row.id}>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40 md:px-4"
                                  onClick={() => toggleEqa(row.id)}
                                >
                                  <span className="min-w-0">
                                    <span className="mr-1.5 text-muted-foreground">
                                      {isOpen ? "▾" : "▸"}
                                    </span>
                                    <span className="font-medium">
                                      {scopeLabel(row.scope)}
                                    </span>
                                    {row.ownerName ? (
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        {row.ownerName}
                                      </span>
                                    ) : null}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="shrink-0 font-normal"
                                  >
                                    {row.itemCount} 科
                                  </Badge>
                                </button>
                                {isOpen ? (
                                  <div className="space-y-2 border-t bg-muted/20 px-3 py-2.5 md:px-4">
                                    {eqaDetailLoading === row.id ? (
                                      <span className="text-xs text-muted-foreground">
                                        加载中…
                                      </span>
                                    ) : !items?.length ? (
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
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
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
