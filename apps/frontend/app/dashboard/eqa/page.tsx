"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  createEqaField,
  deleteEqaField,
  ensureEqaSurveyTemplate,
  fetchEqaDashboard,
  fetchEqaFields,
  fetchEqaParticipation,
  fetchEqaParticipations,
  groupEqaItemsByParent,
  scopeLabel,
  updateEqaField,
  type EqaDashboard,
  type EqaFieldNode,
  type EqaParticipation,
  type EqaParticipationItem,
} from "@/lib/eqa";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FormState = {
  name: string;
  code: string;
  valueType: "group" | "boolean";
  parentCode: string;
  sortOrder: string;
};

const emptyForm = (
  valueType: FormState["valueType"] = "boolean",
  parentCode = "",
): FormState => ({
  name: "",
  code: "",
  valueType,
  parentCode,
  sortOrder: "0",
});

export default function EqaDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const yearNow = new Date().getFullYear();
  const [year, setYear] = useState(yearNow);
  const [loading, setLoading] = useState(true);
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

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [keyword, setKeyword] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm("boolean", "scope.national"));
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpandedId(null);
    const [d, f, p] = await Promise.all([
      fetchEqaDashboard(year),
      fetchEqaFields(),
      fetchEqaParticipations({ year }),
    ]);
    if (d.error) setError(d.error);
    else setDash(d.data || null);
    const items = f.data?.items || [];
    setFields(items);
    const open: Record<string, boolean> = {};
    for (const g of items) open[g.code] = true;
    setOpenGroups((prev) => ({ ...open, ...prev }));
    if (p.data) {
      setRows(p.data.items || []);
      setTotal(p.data.total || 0);
    }
    setLoading(false);
  }, [year]);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    if (user?.role === "admin") load();
  }, [user, router, load]);

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

  const flatFields = useMemo(() => {
    const out: EqaFieldNode[] = [];
    const walk = (nodes: EqaFieldNode[]) => {
      for (const n of nodes || []) {
        out.push(n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(fields);
    return out;
  }, [fields]);

  const groups = useMemo(
    () => fields.filter((n) => n.valueType === "group" || !n.parentCode),
    [fields],
  );

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingCode(null);
      setForm(emptyForm("boolean", "scope.national"));
      setFieldError(null);
    }
  };

  const openCreate = (valueType: FormState["valueType"] = "boolean", parentCode = "") => {
    setEditingCode(null);
    setForm(emptyForm(valueType, parentCode));
    setFieldError(null);
    setDialogOpen(true);
  };

  const startEdit = (code: string) => {
    const n = flatFields.find((x) => x.code === code);
    if (!n) {
      setFieldError(`找不到节点「${code}」，请点刷新后重试`);
      return;
    }
    setEditingCode(n.code);
    setForm({
      name: n.name,
      code: n.code,
      valueType: n.valueType === "group" ? "group" : "boolean",
      parentCode: n.parentCode || "",
      sortOrder: String(n.sortOrder ?? 0),
    });
    setFieldError(null);
    setDialogOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return;
    if (form.valueType !== "group" && !form.parentCode.trim()) {
      setFieldError("科目必须选择父节点（国家/省级）");
      return;
    }
    setSaving(true);
    setFieldError(null);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      valueType: form.valueType,
      parentCode: form.valueType === "group" ? undefined : form.parentCode.trim(),
      sortOrder: Number(form.sortOrder) || 0,
    };
    const res = editingCode
      ? await updateEqaField(editingCode, payload)
      : await createEqaField(payload);
    setSaving(false);
    if (res.error) {
      setFieldError(res.error);
      return;
    }
    closeDialog(false);
    await load();
  };

  const onDelete = async (code: string) => {
    const n = flatFields.find((x) => x.code === code);
    if (!n) {
      setFieldError(`找不到节点「${code}」，请点刷新后重试`);
      return;
    }
    const kids = n.children?.length || 0;
    if (kids > 0) {
      setFieldError(`「${n.name}」下还有 ${kids} 个子科目，请先删除子科目`);
      return;
    }
    const usage = n.usageCount || 0;
    const tip =
      usage > 0
        ? `「${n.name}」已被 ${usage} 条参评记录引用，无法删除。请先在参评记录中取消勾选。`
        : `确定删除「${n.name}」？`;
    if (usage > 0) {
      setFieldError(tip);
      return;
    }
    if (!window.confirm(tip)) return;
    const res = await deleteEqaField(code);
    if (res.error) {
      setFieldError(res.error);
      return;
    }
    if (editingCode === code) closeDialog(false);
    await load();
  };

  const matchKw = (name: string, code: string) => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return true;
    return name.toLowerCase().includes(kw) || code.toLowerCase().includes(kw);
  };

  if (!user || user.role !== "admin") return null;

  const subjectCount = flatFields.filter((n) => n.valueType !== "group").length;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">室间质评 (EQA)</h1>
            <p className="text-sm text-muted-foreground">
              按年度展示国家/省级参评科目（与「检测项目」树无关）。点开参评记录可查看已勾选科目；客户开展的检测类别请看数据看板「检测类别」列或点开医院详情。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
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
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
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
          <CardTitle className="text-base">参评记录（{total}）</CardTitle>
          <CardDescription>点击行展开：按字段树父级（国家/省级）查看已勾选科目</CardDescription>
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    暂无参评记录。可通过问卷发放 EQA 模板，审核通过后自动写入。
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">EQA 科目树</CardTitle>
              <CardDescription>
                国家/省级 → 科目（field_registry）。可增删改；当前科目 {subjectCount} 个。被参评引用的科目不可删除。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                className="w-full sm:w-[200px]"
                placeholder="筛选名称/编码"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={() => openCreate("group")}>
                <Plus className="mr-1 h-4 w-4" />
                新增分组
              </Button>
              <Button size="sm" onClick={() => openCreate("boolean", "scope.national")}>
                <Plus className="mr-1 h-4 w-4" />
                新增科目
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {fieldError && !dialogOpen ? (
            <p className="text-sm text-destructive">{fieldError}</p>
          ) : null}
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              暂无科目，点击「新增分组」或「新增科目」开始
            </p>
          ) : (
            groups.map((g) => {
              const kids = (g.children || []).filter(
                (c) => matchKw(c.name, c.code) || matchKw(g.name, g.code),
              );
              if (keyword.trim() && !matchKw(g.name, g.code) && kids.length === 0) return null;
              const open = openGroups[g.code] !== false;
              return (
                <div key={g.code} className="rounded-lg border">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-2 text-left text-sm font-semibold"
                      onClick={() =>
                        setOpenGroups((s) => ({ ...s, [g.code]: !(s[g.code] !== false) }))
                      }
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {g.name}
                      <Badge variant="outline" className="font-normal">
                        分组
                      </Badge>
                      <span className="text-xs font-normal text-muted-foreground">{g.code}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {(g.children || []).length} 科
                      </span>
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(g.code)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openCreate("boolean", g.code)}>
                      加科目
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => onDelete(g.code)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {open ? (
                    <ul className="divide-y border-t">
                      {(g.children || [])
                        .filter((c) => matchKw(c.name, c.code))
                        .map((c) => (
                          <li
                            key={c.code}
                            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_3rem_auto] items-center gap-x-3 px-3 py-1.5 text-sm"
                          >
                            <span className="truncate font-medium" title={c.name}>
                              {c.name}
                            </span>
                            <span
                              className="truncate font-mono text-xs text-muted-foreground"
                              title={c.code}
                            >
                              {c.code}
                            </span>
                            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                              {(c.usageCount || 0) > 0 ? `${c.usageCount} 次` : ""}
                            </span>
                            <div className="flex shrink-0 justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => startEdit(c.code)}>
                                编辑
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => onDelete(c.code)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      {(g.children || []).filter((c) => matchKw(c.name, c.code)).length === 0 ? (
                        <li className="px-3 py-2 text-xs text-muted-foreground">
                          暂无科目，点击「加科目」添加
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-10">
            <DialogTitle>
              {editingCode
                ? `编辑${form.valueType === "group" ? "分组" : "科目"}`
                : `新增${form.valueType === "group" ? "分组" : "科目"}`}
            </DialogTitle>
            <DialogDescription>
              {form.valueType === "group"
                ? "分组是顶层节点，例如国家室间质评、省级室间质评。"
                : "科目挂在分组下，勾选科目即算参与该级 EQA。编码创建后不可改。"}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={onSubmit}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pt-4"
          >
            {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>类型 *</Label>
                <Select
                  value={form.valueType}
                  onValueChange={(v) => {
                    const valueType = v as FormState["valueType"];
                    setForm((f) => ({
                      ...f,
                      valueType,
                      parentCode: valueType === "group" ? "" : f.parentCode || "scope.national",
                    }));
                  }}
                  disabled={!!editingCode}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">分组</SelectItem>
                    <SelectItem value="boolean">科目</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.valueType !== "group" ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>父分组 *</Label>
                  <Select
                    value={form.parentCode || undefined}
                    onValueChange={(v) => setForm((f) => ({ ...f, parentCode: v }))}
                    disabled={!!editingCode}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择父分组" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.code} value={g.code}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>名称 *</Label>
                <Input
                  required
                  value={form.name}
                  placeholder={form.valueType === "group" ? "如 国家室间质评" : "如 常规化学A"}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>编码 *</Label>
                <Input
                  required
                  value={form.code}
                  placeholder={
                    form.valueType === "group" ? "scope.national" : "national.chem_a"
                  }
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  disabled={!!editingCode}
                />
              </div>
              <div className="space-y-1.5">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter className="sticky bottom-0 z-10 -mx-5 gap-2 border-t bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-end [&>button]:w-full sm:[&>button]:w-auto">
              <Button type="button" variant="outline" onClick={() => closeDialog(false)} disabled={saving}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingCode ? "保存修改" : `新增${form.valueType === "group" ? "分组" : "科目"}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
