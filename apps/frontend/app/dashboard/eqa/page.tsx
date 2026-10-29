"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  ensureEqaSurveyTemplate,
  fetchEqaDashboard,
  fetchEqaFields,
  fetchEqaParticipation,
  fetchEqaParticipations,
  groupEqaItemsByParent,
  scopeLabel,
  type EqaDashboard,
  type EqaFieldNode,
  type EqaParticipation,
  type EqaParticipationItem,
} from "@/lib/eqa";
import { Badge } from "@/components/ui/badge";
import { cn, filterChipSelectedClass } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function EqaDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const yearNow = new Date().getFullYear();
  const [year, setYear] = useState(yearNow);
  const [pageLoading, setPageLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dash, setDash] = useState<EqaDashboard | null>(null);
  const [fields, setFields] = useState<EqaFieldNode[]>([]);
  const [rows, setRows] = useState<EqaParticipation[]>([]);
  const [total, setTotal] = useState(0);
  const [ensuring, setEnsuring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailItems, setDetailItems] = useState<Record<number, EqaParticipationItem[]>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);
  const [selectedFieldCode, setSelectedFieldCode] = useState("");
  const [selectedScope, setSelectedScope] = useState<"" | "national" | "provincial">("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const participationFetchGuard = useRef(true);
  const participationFiltersRef = useRef({
    fieldCode: "",
    scope: "" as "" | "national" | "provincial",
  });
  participationFiltersRef.current = {
    fieldCode: selectedFieldCode,
    scope: selectedScope,
  };

  const loadParticipations = useCallback(async () => {
    const { fieldCode, scope } = participationFiltersRef.current;
    setListLoading(true);
    const p = await fetchEqaParticipations({
      year,
      fieldCode: fieldCode || undefined,
      scope: scope || undefined,
      pageSize: 200,
    });
    if (p.data) {
      setRows(p.data.items || []);
      setTotal(p.data.total || 0);
    } else if (p.error) {
      setError(p.error);
      setRows([]);
      setTotal(0);
    }
    setListLoading(false);
  }, [year]);

  const loadPage = useCallback(async () => {
    const { fieldCode, scope } = participationFiltersRef.current;
    setPageLoading(true);
    setError(null);
    setExpandedId(null);
    const [d, f, p] = await Promise.all([
      fetchEqaDashboard(year),
      fetchEqaFields(),
      fetchEqaParticipations({
        year,
        fieldCode: fieldCode || undefined,
        scope: scope || undefined,
        pageSize: 200,
      }),
    ]);
    if (d.error) setError(d.error);
    else setDash(d.data || null);
    setFields(f.data?.items || []);
    if (p.data) {
      setRows(p.data.items || []);
      setTotal(p.data.total || 0);
    } else if (p.error) {
      setError(p.error);
      setRows([]);
      setTotal(0);
    }
    setPageLoading(false);
  }, [year]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    participationFetchGuard.current = true;
  }, [year, user?.role]);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    if (user?.role !== "admin") return;
    loadPage();
  }, [user, router, year, loadPage]);

  useEffect(() => {
    if (user?.role !== "admin" || pageLoading) return;
    if (participationFetchGuard.current) {
      participationFetchGuard.current = false;
      return;
    }
    const el = scrollRef.current;
    const scrollTop = el?.scrollTop ?? 0;
    void loadParticipations().then(() => {
      if (el) el.scrollTop = scrollTop;
    });
  }, [
    selectedFieldCode,
    selectedScope,
    user?.role,
    pageLoading,
    loadParticipations,
  ]);

  const onEnsureTemplate = async () => {
    setEnsuring(true);
    setMessage(null);
    const res = await ensureEqaSurveyTemplate();
    setEnsuring(false);
    if (res.error) setError(res.error);
    else
      setMessage(
        `已生成/更新问卷模板「${res.data?.template?.title || res.data?.template?.code}」，可在问卷发放中使用。`,
      );
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (detailItems[id]) return;
    setDetailLoading(id);
    const res = await fetchEqaParticipation(id);
    setDetailLoading(null);
    if (res.data?.participation?.items) {
      setDetailItems((s) => ({ ...s, [id]: res.data!.participation.items || [] }));
    } else {
      setDetailItems((s) => ({ ...s, [id]: [] }));
    }
  };

  const groups = useMemo(
    () => fields.filter((n) => n.valueType === "group" || !n.parentCode),
    [fields],
  );

  /** Subject chips for hospital-list filter: all leaf subjects with coverage counts. */
  const subjectChips = useMemo(() => {
    const countByCode = new Map<string, number>();
    for (const it of dash?.topItems || []) {
      countByCode.set(it.fieldCode, it.count);
    }
    const chips: {
      code: string;
      name: string;
      parentCode: string;
      parentName: string;
      scope: "national" | "provincial" | "other";
      count: number;
    }[] = [];
    for (const g of groups) {
      const scope: "national" | "provincial" | "other" =
        g.code === "scope.national" || g.name.includes("国家")
          ? "national"
          : g.code === "scope.provincial" || g.name.includes("省")
            ? "provincial"
            : "other";
      for (const c of g.children || []) {
        if (c.valueType === "group") continue;
        chips.push({
          code: c.code,
          name: c.name,
          parentCode: g.code,
          parentName: g.name,
          scope,
          count: countByCode.get(c.code) || 0,
        });
      }
    }
    return chips.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, "zh");
    });
  }, [groups, dash?.topItems]);

  const nationalChips = useMemo(
    () => subjectChips.filter((c) => c.scope === "national"),
    [subjectChips],
  );
  const provincialChips = useMemo(
    () => subjectChips.filter((c) => c.scope === "provincial"),
    [subjectChips],
  );

  const selectedSubject = useMemo(
    () => subjectChips.find((c) => c.code === selectedFieldCode) || null,
    [subjectChips, selectedFieldCode],
  );

  const scopeCoverageCount = useCallback(
    (scope: "national" | "provincial") =>
      dash?.byScope?.find((s) => s.scope === scope)?.count ?? 0,
    [dash?.byScope],
  );

  const filteredHospitalCount = useMemo(() => {
    if (selectedFieldCode) {
      if (selectedSubject) return selectedSubject.count;
      const ids = new Set(rows.map((r) => r.hospitalId));
      return ids.size;
    }
    if (selectedScope) return scopeCoverageCount(selectedScope);
    return dash?.coverageHospitals ?? 0;
  }, [
    selectedFieldCode,
    selectedSubject,
    selectedScope,
    scopeCoverageCount,
    dash?.coverageHospitals,
    rows,
  ]);

  const selectAllSubjects = () => {
    setSelectedFieldCode("");
    setSelectedScope("");
  };
  const selectScopeAll = (scope: "national" | "provincial") => {
    setSelectedFieldCode("");
    setSelectedScope((prev) => (prev === scope ? "" : scope));
  };
  const selectSubject = (code: string) => {
    setSelectedScope("");
    setSelectedFieldCode((prev) => (prev === code ? "" : code));
  };

  const SCOPE_CHIP_CLASS: Record<string, string> = {
    "scope.national":
      "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
    "scope.provincial":
      "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
  };
  const FILTER_ALL_CLASS =
    "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";

  if (!user || user.role !== "admin") return null;

  const loading = pageLoading;
  const tableBusy = pageLoading || listLoading;

  return (
    <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">室间质评 (EQA)</h1>
            <p className="text-sm text-muted-foreground">
              按年度展示国家/省级参评科目（与「检测项目」树无关）。点开参评记录可查看已勾选科目；科目字典维护见侧栏「EQA科目树」。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(year)}
            onValueChange={(v) => {
              setSelectedFieldCode("");
              setSelectedScope("");
              setYear(Number(v));
            }}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[yearNow, yearNow - 1, yearNow - 2].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} 年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={loadPage} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={onEnsureTemplate} disabled={ensuring}>
            {ensuring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成 EQA 问卷模板
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>参评记录</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? "…" : dash?.totalParticipations ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>覆盖医院</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? "…" : dash?.coverageHospitals ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        {(["national", "provincial"] as const).map((scope) => {
          const count = dash?.byScope?.find((s) => s.scope === scope)?.count ?? 0;
          return (
            <Card key={scope}>
              <CardHeader className="pb-2">
                <CardDescription>
                  {scope === "national" ? "国家级 EQA 参与客户" : "省级 EQA 参与客户"}
                </CardDescription>
                <CardTitle className="text-2xl">{loading ? "…" : count}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">负责人进度</CardTitle>
          <CardDescription>参评数 / 勾选项数</CardDescription>
        </CardHeader>
        <CardContent>
          {(dash?.ownerProgress || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无数据</p>
          ) : (
            <ul className="space-y-2">
              {dash!.ownerProgress.map((o, i) => (
                <li key={o.ownerUserId || i} className="flex justify-between text-sm">
                  <span>{o.ownerName}</span>
                  <span className="text-muted-foreground">
                    {o.participation} 条 · {o.itemCount} 项
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                参评医院
                <Badge variant="secondary" className="ml-2 font-normal">
                  {tableBusy ? "…" : `${filteredHospitalCount} 家`}
                </Badge>
              </CardTitle>
              <CardDescription>
                {selectedSubject
                  ? `已筛选科目「${selectedSubject.name}」· ${filteredHospitalCount} 家医院 · ${total} 条参评记录。点击行可展开查看勾选明细。`
                  : selectedScope
                    ? `已筛选${selectedScope === "national" ? "国家级" : "省市级"}全部科目 · ${filteredHospitalCount} 家医院 · ${total} 条参评记录。点击行可展开查看勾选明细。`
                    : "上方点选科目可筛选覆盖该科目的医院；也可按国家级/省市级整级筛选。点击行展开查看已勾选科目。"}
              </CardDescription>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">按科目筛选</span>
              {selectedSubject || selectedScope ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={selectAllSubjects}
                >
                  清除筛选
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={selectAllSubjects}
                className={cn(
                  "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  FILTER_ALL_CLASS,
                  !selectedFieldCode && !selectedScope
                    ? filterChipSelectedClass
                    : "opacity-90 hover:opacity-100",
                )}
              >
                全部
                <span className="ml-1 tabular-nums opacity-80">
                  {dash?.coverageHospitals ?? 0}
                </span>
              </button>
            </div>
            {(
              [
                {
                  key: "national" as const,
                  label: "国家级",
                  chips: nationalChips,
                  allClass: SCOPE_CHIP_CLASS["scope.national"],
                  chipClass: SCOPE_CHIP_CLASS["scope.national"],
                },
                {
                  key: "provincial" as const,
                  label: "省市级",
                  chips: provincialChips,
                  allClass: SCOPE_CHIP_CLASS["scope.provincial"],
                  chipClass: SCOPE_CHIP_CLASS["scope.provincial"],
                },
              ] as const
            ).map((block) => (
              <div key={block.key} className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">{block.label}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    title={`选中${block.label}下全部科目`}
                    onClick={() => selectScopeAll(block.key)}
                    className={cn(
                      "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      block.allClass,
                      selectedScope === block.key && !selectedFieldCode
                        ? filterChipSelectedClass
                        : "opacity-90 hover:opacity-100",
                    )}
                  >
                    {block.label}全部
                    <span className="ml-1 tabular-nums opacity-80">
                      {scopeCoverageCount(block.key)}
                    </span>
                  </button>
                  {block.chips.map((chip) => {
                    const active = selectedFieldCode === chip.code;
                    return (
                      <button
                        key={chip.code}
                        type="button"
                        title={`${chip.parentName} · ${chip.name}（${chip.count} 家）`}
                        onClick={() => selectSubject(chip.code)}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                          block.chipClass,
                          active
                            ? filterChipSelectedClass
                            : "opacity-90 hover:opacity-100",
                          chip.count === 0 ? "opacity-50" : "",
                        )}
                      >
                        <span className="truncate">{chip.name}</span>
                        <span className="shrink-0 tabular-nums opacity-80">{chip.count}</span>
                      </button>
                    );
                  })}
                  {!loading && block.chips.length === 0 ? (
                    <span className="text-xs text-muted-foreground">暂无科目</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>医院</TableHead>
                <TableHead>年份</TableHead>
                <TableHead>范围</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>勾选项</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableBusy ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    {selectedSubject
                      ? `当前科目「${selectedSubject.name}」暂无参评医院。`
                      : selectedScope
                        ? `当前${selectedScope === "national" ? "国家级" : "省市级"}暂无参评医院。`
                        : "暂无参评记录。可通过问卷发放 EQA 模板，审核通过后自动写入。"}
                  </TableCell>
                </TableRow>
              ) : (
                rows.flatMap((r) => {
                  const open = expandedId === r.id;
                  const items = detailItems[r.id];
                  const groupsByParent = open ? groupEqaItemsByParent(items, fields) : [];
                  const main = (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => toggleExpand(r.id)}
                    >
                      <TableCell>
                        <span className="mr-1.5 text-muted-foreground">{open ? "▾" : "▸"}</span>
                        {r.hospitalName || r.hospitalId}
                      </TableCell>
                      <TableCell>{r.year}</TableCell>
                      <TableCell>{scopeLabel(r.scope)}</TableCell>
                      <TableCell>{r.ownerName || "-"}</TableCell>
                      <TableCell>{r.itemCount}</TableCell>
                    </TableRow>
                  );
                  if (!open) return [main];
                  const detail = (
                    <TableRow key={`${r.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={5} className="px-4 py-3">
                        {detailLoading === r.id ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> 加载科目…
                          </div>
                        ) : !items?.length ? (
                          <p className="text-sm text-muted-foreground">暂无勾选科目</p>
                        ) : (
                          <div className="space-y-3">
                            {groupsByParent.map((g) => (
                              <div key={g.parentCode} className="space-y-1.5">
                                <div className="text-xs font-semibold text-muted-foreground">
                                  {g.parentName}
                                  <span className="ml-2 font-normal">({g.items.length})</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {g.items.map((it) => (
                                    <Badge key={it.fieldCode} variant="outline" className="font-normal">
                                      {it.fieldName || it.fieldCode}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                  return [main, detail];
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
