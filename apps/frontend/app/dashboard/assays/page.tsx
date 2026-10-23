"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, FlaskConical, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import {
  createAssayProject,
  deleteAssayProject,
  fetchAssayTree,
  listAssayProjects,
  updateAssayProject,
  type AssayProject,
  type AssayTreeNode,
} from "@/lib/business";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormState = {
  name: string;
  code: string;
  kind: "line" | "category" | "item";
  parentCode: string;
  sortOrder: string;
  status: string;
};

const emptyForm = (kind: FormState["kind"] = "item", parentCode = ""): FormState => ({
  name: "",
  code: "",
  kind,
  parentCode,
  sortOrder: "0",
  status: "active",
});

function kindLabel(kind: string) {
  if (kind === "line") return "产线";
  if (kind === "category") return "类别";
  return "细项";
}

export default function AssayProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tree, setTree] = useState<AssayTreeNode[]>([]);
  const [flatItems, setFlatItems] = useState<AssayProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm("line"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openLines, setOpenLines] = useState<Record<string, boolean>>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (user && !isAdmin(user)) router.replace("/dashboard");
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [treeRes, listRes] = await Promise.all([
      fetchAssayTree(),
      listAssayProjects({ status: "all", kind: "all", page: 1, pageSize: 5000 }),
    ]);
    if (treeRes.error) setError(treeRes.error);
    if (listRes.error) setError(listRes.error);
    const items = treeRes.items || [];
    setTree(items);
    setFlatItems(listRes.items);
    const lines: Record<string, boolean> = {};
    const cats: Record<string, boolean> = {};
    for (const line of items) {
      lines[line.code] = true;
      for (const cat of line.children || []) cats[cat.code] = false;
    }
    setOpenLines((prev) => ({ ...lines, ...prev }));
    setOpenCats((prev) => ({ ...cats, ...prev }));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user && isAdmin(user)) load();
  }, [user, load]);

  const resetForm = (kind: FormState["kind"] = "line", parentCode = "") => {
    setForm(emptyForm(kind, parentCode));
    setEditingId(null);
  };

  const startEdit = (code: string) => {
    const p = flatItems.find((x) => x.code === code);
    if (!p) return;
    setEditingId(p.id);
    setForm({
      name: p.name,
      code: p.code || "",
      kind: (p.kind as FormState["kind"]) || "item",
      parentCode: p.parentCode || "",
      sortOrder: String(p.sortOrder ?? 0),
      status: p.status || "active",
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return;
    if (form.kind !== "line" && !form.parentCode.trim()) {
      setError(`${kindLabel(form.kind)}必须选择父节点`);
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      kind: form.kind,
      parentCode: form.kind === "line" ? undefined : form.parentCode.trim(),
      sortOrder: Number(form.sortOrder) || 0,
      status: form.status,
    };
    const res = editingId
      ? await updateAssayProject(editingId, payload)
      : await createAssayProject(payload);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    resetForm(form.kind, form.parentCode);
    await load();
  };

  const onDelete = async (code: string) => {
    const p = flatItems.find((x) => x.code === code);
    if (!p) return;
    const tip =
      p.usageCount > 0
        ? `「${p.name}」已被 ${p.usageCount} 家医院引用，将标记为停用。继续？`
        : `确定删除「${p.name}」？`;
    if (!window.confirm(tip)) return;
    const res = await deleteAssayProject(p.id);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (editingId === p.id) resetForm();
    await load();
  };

  const parentOptions = useMemo(() => {
    if (form.kind === "category") {
      return tree.map((l) => ({ code: l.code, name: l.name }));
    }
    if (form.kind === "item") {
      const out: { code: string; name: string }[] = [];
      for (const line of tree) {
        for (const cat of line.children || []) {
          out.push({ code: cat.code, name: `${line.name} / ${cat.name}` });
        }
      }
      return out;
    }
    return [];
  }, [form.kind, tree]);

  const matchKw = (name: string, code: string) => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return true;
    return name.toLowerCase().includes(kw) || code.toLowerCase().includes(kw);
  };

  if (!user || !isAdmin(user)) return null;

  const totalItems = flatItems.filter((p) => p.kind === "item").length;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <FlaskConical className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>检测项目目录</CardTitle>
                <CardDescription>
                  产线 → 类别 → 细项。医院开展只挂叶子细项。当前细项 {totalItems} 个。
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                className="w-full sm:w-[200px]"
                placeholder="筛选名称/编码"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>层级 *</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => {
                  const kind = v as FormState["kind"];
                  setForm((f) => ({
                    ...f,
                    kind,
                    parentCode: kind === "line" ? "" : f.parentCode,
                  }));
                }}
                disabled={!!editingId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">产线</SelectItem>
                  <SelectItem value="category">类别</SelectItem>
                  <SelectItem value="item">细项</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.kind !== "line" ? (
              <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                <Label>父节点 *</Label>
                <Select
                  value={form.parentCode || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, parentCode: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择父节点" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {parentOptions.map((o) => (
                      <SelectItem key={o.code} value={o.code}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>名称 *</Label>
              <Input
                required
                value={form.name}
                placeholder={form.kind === "item" ? "如 ALT" : "如 生化项目"}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>编码 *</Label>
              <Input
                required
                value={form.code}
                placeholder={form.kind === "item" ? "biochem.liver.alt" : "biochem"}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                disabled={!!editingId}
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
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="inactive">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 md:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingId ? "保存修改" : `新增${kindLabel(form.kind)}`}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={() => resetForm()}>
                  取消编辑
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => resetForm("line")}>
                清空
              </Button>
            </div>
          </form>

          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : tree.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无目录节点，请先新增产线</p>
          ) : (
            <div className="space-y-3">
              {tree.map((line) => {
                const lineOpen = !!openLines[line.code];
                const cats = (line.children || []).filter(
                  (c) =>
                    matchKw(c.name, c.code) ||
                    (c.children || []).some((i) => matchKw(i.name, i.code)) ||
                    matchKw(line.name, line.code),
                );
                if (keyword.trim() && !matchKw(line.name, line.code) && cats.length === 0) {
                  return null;
                }
                return (
                  <div key={line.code} className="rounded-lg border">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-2 text-left text-sm font-semibold"
                        onClick={() => setOpenLines((s) => ({ ...s, [line.code]: !s[line.code] }))}
                      >
                        {lineOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {line.name}
                        <Badge variant="outline" className="font-normal">
                          产线
                        </Badge>
                        <span className="text-xs font-normal text-muted-foreground">{line.code}</span>
                      </button>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(line.code)}>
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          resetForm("category", line.code);
                        }}
                      >
                        +类别
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(line.code)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {lineOpen ? (
                      <div className="space-y-2 border-t px-3 py-2">
                        {(line.children || []).map((cat) => {
                          const items = (cat.children || []).filter((i) => matchKw(i.name, i.code) || matchKw(cat.name, cat.code));
                          if (keyword.trim() && !matchKw(cat.name, cat.code) && items.length === 0) return null;
                          const catOpen = !!openCats[cat.code];
                          return (
                            <div key={cat.code} className="rounded border bg-muted/20">
                              <div className="flex items-center gap-2 px-2 py-1.5">
                                <button
                                  type="button"
                                  className="flex flex-1 items-center gap-2 text-left text-sm"
                                  onClick={() => setOpenCats((s) => ({ ...s, [cat.code]: !s[cat.code] }))}
                                >
                                  {catOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  <span className="font-medium">{cat.name}</span>
                                  <Badge variant="secondary" className="font-normal">
                                    类别
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {(cat.children || []).length} 项
                                  </span>
                                </button>
                                <Button size="sm" variant="ghost" onClick={() => startEdit(cat.code)}>
                                  编辑
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => resetForm("item", cat.code)}>
                                  +细项
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => onDelete(cat.code)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              {catOpen ? (
                                <ul className="divide-y border-t">
                                  {(cat.children || [])
                                    .filter((i) => matchKw(i.name, i.code))
                                    .map((item) => {
                                      const usage =
                                        flatItems.find((p) => p.code === item.code)?.usageCount ?? 0;
                                      return (
                                        <li
                                          key={item.code}
                                          className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                                        >
                                          <div className="min-w-0">
                                            <span className="font-medium">{item.name}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">{item.code}</span>
                                            {usage > 0 ? (
                                              <span className="ml-2 text-xs text-muted-foreground">
                                                {usage} 院
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className="flex shrink-0 gap-1">
                                            <Button size="sm" variant="ghost" onClick={() => startEdit(item.code)}>
                                              编辑
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="text-destructive"
                                              onClick={() => onDelete(item.code)}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </li>
                                      );
                                    })}
                                  {(cat.children || []).filter((i) => matchKw(i.name, i.code)).length === 0 ? (
                                    <li className="px-3 py-2 text-xs text-muted-foreground">暂无细项</li>
                                  ) : null}
                                </ul>
                              ) : null}
                            </div>
                          );
                        })}
                        {(line.children || []).length === 0 ? (
                          <p className="px-1 py-2 text-xs text-muted-foreground">暂无类别，点击「+类别」添加</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
