"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  fetchHospitalAssays,
  getHospital,
  listCustomers,
  listDevices,
  type Customer,
  type Device,
  type HospitalAssayCategory,
  type HospitalAssayCompetitorCategory,
} from "@/lib/business";
import {
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
  ARCHIVE_FIELD_DEFS,
  displayValue,
  formatMatchingRate,
  HOSPITAL_ATTRIBUTE_LABELS,
  resolveArchiveField,
  type ArchiveFieldKey,
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

export function HospitalDetailSheet({
  hospitalId,
  open,
  onOpenChange,
}: HospitalDetailSheetProps) {
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assayCategories, setAssayCategories] = useState<HospitalAssayCategory[]>([]);
  const [competitors, setCompetitors] = useState<HospitalAssayCompetitorCategory[]>([]);
  const [mindrayLines, setMindrayLines] = useState<string[]>([]);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [eqaRows, setEqaRows] = useState<EqaParticipation[]>([]);
  const [eqaFields, setEqaFields] = useState<EqaFieldNode[]>([]);
  const [openEqa, setOpenEqa] = useState<Record<number, boolean>>({});
  const [eqaItems, setEqaItems] = useState<Record<number, EqaParticipationItem[]>>({});
  const [eqaDetailLoading, setEqaDetailLoading] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !hospitalId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const [hRes, dRes, cRes, aRes, eRes, fRes] = await Promise.all([
        getHospital(hospitalId),
        listDevices(hospitalId),
        listCustomers({ hospitalId, page: 1, pageSize: 20 }),
        fetchHospitalAssays(hospitalId),
        fetchEqaParticipations({ hospitalId, page: 1, pageSize: 50 }),
        fetchEqaFields(),
      ]);
      if (cancelled) return;
      if (hRes.error) {
        setError(hRes.error);
        setHospital(null);
        setDevices([]);
        setCustomers([]);
        setAssayCategories([]);
        setCompetitors([]);
        setMindrayLines([]);
        setOpenCats({});
        setEqaRows([]);
        setEqaFields([]);
        setOpenEqa({});
        setEqaItems({});
      } else {
        setHospital(hRes.hospital || null);
        setDevices(dRes.items);
        setCustomers(cRes.items);
        const cats = aRes.categories || [];
        setAssayCategories(cats);
        setCompetitors(aRes.competitors || []);
        setMindrayLines(aRes.mindrayLines || []);
        // Default: expand all 检测线; expand categories when few
        const nextOpen: Record<string, boolean> = {};
        const lineKeys = new Set<string>();
        for (const cat of cats) {
          const lk = cat.lineCode || cat.lineName || "_noline";
          lineKeys.add(lk);
        }
        for (const lk of lineKeys) {
          nextOpen[`line:${lk}`] = true;
        }
        if (cats.length <= 3) {
          for (const cat of cats) {
            nextOpen[cat.code || cat.name] = true;
          }
        }
        setOpenCats(nextOpen);
        setEqaRows(eRes.data?.items || []);
        setEqaFields(fRes.data?.items || []);
        setOpenEqa({});
        setEqaItems({});
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, hospitalId]);

  const values = useMemo(() => {
    const map: Partial<Record<ArchiveFieldKey, string>> = {};
    for (const field of ARCHIVE_FIELD_DEFS) {
      map[field.key] = hospital
        ? resolveArchiveField(
            {
              name: hospital.name,
              city: hospital.city,
              province: hospital.province,
              level: hospital.level,
              remark: hospital.remark,
              deviceModels: hospital.deviceModels,
              archive: {
                ...(hospital.archive || {}),
                // prefer live device/customer when archive empty
                model:
                  hospital.archive?.model ||
                  devices[0]?.model ||
                  hospital.deviceModels?.[0] ||
                  "",
                serialNo:
                  hospital.archive?.serialNo || devices[0]?.serialNo || "",
                contactName:
                  hospital.archive?.contactName || customers[0]?.name || "",
                contactPhone:
                  hospital.archive?.contactPhone || customers[0]?.phone || "",
                installedAt:
                  hospital.archive?.installedAt || devices[0]?.installedAt || "",
              },
            },
            field.key,
          )
        : "";
    }
    return map;
  }, [hospital, devices, customers]);

  const sections = useMemo(() => {
    const order: string[] = [];
    const grouped = new Map<string, typeof ARCHIVE_FIELD_DEFS>();
    for (const field of ARCHIVE_FIELD_DEFS) {
      // Retired flat project lists — shown from hospital_assays below.
      if ((field.key as string) === "mindrayProjects" || (field.key as string) === "newProjects" || (field.key as string) === "missingProjects") {
        continue;
      }
      if (!grouped.has(field.section)) {
        grouped.set(field.section, []);
        order.push(field.section);
      }
      grouped.get(field.section)!.push(field);
    }
    return order.map((section) => ({
      section,
      fields: grouped.get(section) || [],
    }));
  }, []);

  /** Group selected leaves as 检测线 → 类别 → 细项 for the card. */
  const assayLines = useMemo(() => {
    type LineGroup = {
      code: string;
      name: string;
      categories: HospitalAssayCategory[];
    };
    const order: string[] = [];
    const map = new Map<string, LineGroup>();
    for (const cat of assayCategories) {
      const key = cat.lineCode || cat.lineName || "_noline";
      let line = map.get(key);
      if (!line) {
        line = {
          code: cat.lineCode || "",
          name: cat.lineName || "未分检测线",
          categories: [],
        };
        map.set(key, line);
        order.push(key);
      }
      line.categories.push(cat);
    }
    return order.map((k) => map.get(k)!);
  }, [assayCategories]);

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
                客户阶段与需求
              </h3>
              <div className="grid divide-y rounded-lg border bg-background md:grid-cols-2 md:divide-x md:divide-y-0">
                {[
                  {
                    label: HOSPITAL_ATTRIBUTE_LABELS.customer_level || "客户等级",
                    value: hospital?.attributes?.customer_level || resolveArchiveField(hospital || {}, "customerLevel"),
                  },
                  {
                    label: HOSPITAL_ATTRIBUTE_LABELS.customer_stage || "客户所在阶段",
                    value: hospital?.attributes?.customer_stage || "",
                  },
                  {
                    label: HOSPITAL_ATTRIBUTE_LABELS.usage_location || "使用位置",
                    value: hospital?.attributes?.usage_location || "",
                  },
                  {
                    label: HOSPITAL_ATTRIBUTE_LABELS.pending_issues || "客户端待解决问题及需求",
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
            </section>
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
                检测项目开展
              </h3>
              <div className="rounded-lg border bg-background text-sm">
                {assayLines.length === 0 ? (
                  <div className="px-3 py-3 text-muted-foreground md:px-4">
                    暂无开展项目（问卷「设备列表」或「检测项目」块审核通过后写入；设备勾选细项即表示开展）
                  </div>
                ) : (
                  <ul className="divide-y">
                    {assayLines.map((line) => {
                      const lineKey = line.code || line.name;
                      const lineOpen = openCats[`line:${lineKey}`] !== false;
                      const catCount = line.categories.length;
                      const itemTotal = line.categories.reduce(
                        (n, c) => n + (c.itemCount || c.items?.length || 0),
                        0,
                      );
                      return (
                        <li key={lineKey}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/50 md:px-4"
                            onClick={() =>
                              setOpenCats((s) => ({
                                ...s,
                                [`line:${lineKey}`]: !lineOpen,
                              }))
                            }
                          >
                            <span className="min-w-0">
                              <span className="mr-1.5 text-muted-foreground">
                                {lineOpen ? "▾" : "▸"}
                              </span>
                              <span className="font-semibold">{line.name}</span>
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                检测线
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <Badge variant="outline" className="font-normal">
                                {catCount} 类
                              </Badge>
                              <Badge variant="secondary" className="font-normal">
                                {itemTotal} 项
                              </Badge>
                            </span>
                          </button>
                          {lineOpen ? (
                            <ul className="divide-y border-t">
                              {line.categories.map((cat) => {
                                const key = cat.code || cat.name;
                                const open = !!openCats[key];
                                return (
                                  <li key={key}>
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-between gap-2 px-3 py-2 pl-7 text-left hover:bg-muted/40 md:px-4 md:pl-10"
                                      onClick={() =>
                                        setOpenCats((s) => ({
                                          ...s,
                                          [key]: !s[key],
                                        }))
                                      }
                                    >
                                      <span className="min-w-0">
                                        <span className="mr-1.5 text-muted-foreground">
                                          {open ? "▾" : "▸"}
                                        </span>
                                        <span className="font-medium">{cat.name}</span>
                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                          类别
                                        </span>
                                      </span>
                                      <Badge
                                        variant="secondary"
                                        className="shrink-0 font-normal"
                                      >
                                        {cat.itemCount || cat.items?.length || 0}{" "}
                                        细项
                                      </Badge>
                                    </button>
                                    {open ? (
                                      <div className="flex flex-wrap gap-1.5 border-t bg-muted/20 px-3 py-2.5 pl-7 md:px-4 md:pl-10">
                                        {(cat.items || []).length === 0 ? (
                                          <span className="text-xs text-muted-foreground">
                                            无细项
                                          </span>
                                        ) : (
                                          (cat.items || []).map((it) => (
                                            <Badge
                                              key={it.code || it.name}
                                              variant="outline"
                                              className="font-normal"
                                            >
                                              {it.name}
                                            </Badge>
                                          ))
                                        )}
                                      </div>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
                设备与竞品
              </h3>
              <div className="rounded-lg border bg-background text-sm">
                {mindrayLines.length > 0 ? (
                  <div className="border-b px-3 py-2.5 md:px-4">
                    <div className="mb-1 text-xs text-muted-foreground">迈瑞覆盖检测线</div>
                    <div className="flex flex-wrap gap-1.5">
                      {mindrayLines.map((n) => (
                        <Badge key={n} variant="secondary" className="font-normal">
                          {n}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {devices.length === 0 ? (
                  <div className="px-3 py-3 text-muted-foreground md:px-4">
                    暂无设备记录
                  </div>
                ) : (
                  <ul className="divide-y">
                    {devices.map((d) => (
                      <li key={d.id} className="px-3 py-2.5 md:px-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {d.brand || "迈瑞"} {d.model}
                          </span>
                          {d.assayLineCode ? (
                            <Badge variant="outline" className="font-normal">
                              {d.assayLineCode}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="font-normal">
                              {d.category}
                            </Badge>
                          )}
                          {(d.itemCodes?.length || 0) > 0 ? (
                            <Badge variant="secondary" className="font-normal">
                              {d.itemCodes!.length} 细项
                            </Badge>
                          ) : null}
                          {d.serviceEvaluation ? (
                            <Badge variant="outline" className="font-normal">
                              {d.serviceEvaluation}
                            </Badge>
                          ) : null}
                        </div>
                        {d.serialNo ? (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            SN {d.serialNo}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {competitors.length > 0 ? (
                  <div className="border-t px-3 py-2.5 md:px-4">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      同检测线 / 类别下的竞品设备
                    </div>
                    <ul className="space-y-2">
                      {competitors.map((c) => (
                        <li key={c.code || c.name} className="rounded-md border bg-muted/20 p-2">
                          <div className="mb-1 text-xs">
                            <span className="font-medium">{c.lineName || "检测线"}</span>
                            <span className="text-muted-foreground"> · </span>
                            <span>{c.name}</span>
                          </div>
                          <div className="space-y-1">
                            {c.devices.map((dev) => (
                              <div key={dev.deviceId} className="text-sm">
                                <span className="font-medium">
                                  {dev.brand} {dev.model}
                                </span>
                                {(dev.itemNames?.length || 0) > 0 ? (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {dev.itemNames!.slice(0, 8).join("、")}
                                    {dev.itemNames!.length > 8 ? "…" : ""}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
                室间质评参与
              </h3>
              <div className="rounded-lg border bg-background text-sm">
                {eqaRows.length === 0 ? (
                  <div className="px-3 py-3 text-muted-foreground md:px-4">
                    暂无 EQA 参评记录（国家/省级科目，与上方「检测项目」类别不同）
                  </div>
                ) : (
                  <ul className="divide-y">
                    {eqaRows.map((row) => {
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
                              <span className="font-medium">{row.year} 年</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {scopeLabel(row.scope)}
                              </span>
                              {row.ownerName ? (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {row.ownerName}
                                </span>
                              ) : null}
                            </span>
                            <Badge variant="secondary" className="shrink-0 font-normal">
                              {row.itemCount} 科
                            </Badge>
                          </button>
                          {isOpen ? (
                            <div className="space-y-2 border-t bg-muted/20 px-3 py-2.5 md:px-4">
                              {eqaDetailLoading === row.id ? (
                                <span className="text-xs text-muted-foreground">加载中…</span>
                              ) : !items?.length ? (
                                <span className="text-xs text-muted-foreground">无勾选科目</span>
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
                )}
              </div>
            </section>
            {sections.map((group) => (
              <section key={group.section} className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
                  {group.section}
                </h3>
                <div className="grid divide-y rounded-lg border bg-background md:grid-cols-2 md:divide-x md:divide-y-0">
                  {group.fields.map((field) => (
                    <div
                      key={field.key}
                      className="flex flex-col gap-1 border-b px-3 py-3 text-sm last:border-b-0 md:grid md:grid-cols-[8rem_1fr] md:gap-3 md:border-b md:px-4 md:odd:border-r"
                    >
                      <div className="text-xs text-muted-foreground md:text-sm">
                        {field.label}
                      </div>
                      <div className="break-words whitespace-pre-wrap text-foreground">
                        {field.key === "matchingRate"
                          ? formatMatchingRate(values[field.key])
                          : displayValue(values[field.key])}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
