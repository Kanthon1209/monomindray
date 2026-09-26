"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import {
  createAssayProject,
  deleteAssayProject,
  listAssayProjects,
  updateAssayProject,
  type AssayProject,
} from "@/lib/business";
import { ComboboxInput } from "@/components/ui/combobox-input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DesktopTable,
  MobileCardItem,
  MobileCardList,
  PageToolbar,
} from "@/components/mobile-data-list";

const LINE_OPTIONS = ["发光", "生化", "凝血", "血球", "尿液", "其他"];
const COMMON_COMPANIES = ["迈瑞", "罗氏", "雅培", "贝克曼", "西门子", "安图", "新产业", "科美", "索灵", "迈克"];

const emptyForm = {
  name: "",
  code: "",
  company: "",
  lineCategory: "",
  aliasesText: "",
  status: "active",
};

function ownershipBadge(ownership: string) {
  if (ownership === "own") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">自有</Badge>;
  }
  return <Badge variant="secondary">竞品</Badge>;
}

export default function AssayProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AssayProject[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && !isAdmin(user)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const companyOptions = useMemo(() => {
    return Array.from(new Set([...COMMON_COMPANIES, ...companies])).filter(Boolean);
  }, [companies]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAssayProjects({
      keyword,
      company: companyFilter === "all" ? undefined : companyFilter,
      ownership: ownershipFilter === "all" ? undefined : ownershipFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      page: 1,
      pageSize: 200,
    });
    if (res.error) setError(res.error);
    setItems(res.items);
    setTotal(res.total);
    setCompanies(res.companies);
    setLoading(false);
  }, [keyword, companyFilter, ownershipFilter, statusFilter]);

  useEffect(() => {
    if (user && isAdmin(user)) load();
  }, [user, load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (p: AssayProject) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      code: p.code || "",
      company: p.company || "",
      lineCategory: p.lineCategory || "",
      aliasesText: (p.aliases || []).join("、"),
      status: p.status || "active",
    });
  };

  const parseAliases = (text: string) =>
    text
      .split(/[,，、;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      company: form.company.trim() || undefined,
      lineCategory: form.lineCategory.trim() || undefined,
      aliases: parseAliases(form.aliasesText),
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
    resetForm();
    await load();
  };

  const onDelete = async (p: AssayProject) => {
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

  if (!user || !isAdmin(user)) return null;

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
                <CardTitle>检测项目</CardTitle>
                <CardDescription>
                  维护项目字典与所属公司。自有/竞品由公司名自动判断（迈瑞 /
                  Mindray = 自有），当前共 {total} 项。
                </CardDescription>
              </div>
            </div>
            <PageToolbar>
              <Input
                className="w-full sm:w-[180px]"
                placeholder="搜索名称/别名/公司"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue placeholder="公司" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部公司</SelectItem>
                  {companyOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ownershipFilter} onValueChange={setOwnershipFilter}>
                <SelectTrigger className="w-full sm:w-[120px]">
                  <SelectValue placeholder="归属" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部归属</SelectItem>
                  <SelectItem value="own">自有</SelectItem>
                  <SelectItem value="competitor">竞品</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[110px]">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="inactive">停用</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </PageToolbar>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-0">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border p-4 md:grid-cols-2 lg:grid-cols-3"
          >
            <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
              <Label htmlFor="assay-name">项目名称 *</Label>
              <Input
                id="assay-name"
                required
                value={form.name}
                placeholder="如 AFP 或 乙肝5项"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assay-company">所属公司</Label>
              <ComboboxInput
                id="assay-company"
                value={form.company}
                onChange={(v) => setForm((f) => ({ ...f, company: v }))}
                options={companyOptions}
                placeholder="迈瑞 / 罗氏 / …"
              />
              {form.company ? (
                <p className="text-xs text-muted-foreground">
                  将显示为：
                  {form.company.trim().toLowerCase().includes("mindray") ||
                  form.company.trim() === "迈瑞" ||
                  form.company.trim().startsWith("迈瑞")
                    ? "自有"
                    : "竞品"}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">未填公司时按竞品展示</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assay-line">产线</Label>
              <ComboboxInput
                id="assay-line"
                value={form.lineCategory}
                onChange={(v) => setForm((f) => ({ ...f, lineCategory: v }))}
                options={LINE_OPTIONS}
                placeholder="发光 / 生化 …"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assay-code">编码</Label>
              <Input
                id="assay-code"
                value={form.code}
                placeholder="可选"
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assay-aliases">别名</Label>
              <Input
                id="assay-aliases"
                value={form.aliasesText}
                placeholder="甲胎蛋白、AFP 抗原（顿号分隔）"
                onChange={(e) => setForm((f) => ({ ...f, aliasesText: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
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
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {editingId ? "保存修改" : "新增项目"}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={resetForm}>
                  取消编辑
                </Button>
              ) : null}
            </div>
          </form>

          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <DesktopTable>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>所属公司</TableHead>
                      <TableHead>归属</TableHead>
                      <TableHead>产线</TableHead>
                      <TableHead>别名</TableHead>
                      <TableHead>引用医院</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="w-[120px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          暂无项目，请先新增或从档案导入后自动生成
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.name}
                            {p.code ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {p.code}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>{p.company || "—"}</TableCell>
                          <TableCell>{ownershipBadge(p.ownership)}</TableCell>
                          <TableCell>{p.lineCategory || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground">
                            {(p.aliases || []).join("、") || "—"}
                          </TableCell>
                          <TableCell>{p.usageCount}</TableCell>
                          <TableCell>
                            {p.status === "active" ? (
                              <Badge variant="outline">启用</Badge>
                            ) : (
                              <Badge variant="secondary">停用</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEdit(p)}
                              >
                                编辑
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => onDelete(p)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </DesktopTable>

              <MobileCardList>
                {items.length === 0 ? (
                  <li className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    暂无项目
                  </li>
                ) : (
                  items.map((p) => (
                    <MobileCardItem key={p.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{p.name}</div>
                        {ownershipBadge(p.ownership)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {[p.company, p.lineCategory].filter(Boolean).join(" · ") ||
                          "未填公司"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.usageCount} 家医院引用
                        {p.status !== "active" ? " · 已停用" : ""}
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          variant="outline"
                          className="min-h-10 w-full"
                          onClick={() => startEdit(p)}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="destructive"
                          className="min-h-10 w-full"
                          onClick={() => onDelete(p)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          删除
                        </Button>
                      </div>
                    </MobileCardItem>
                  ))
                )}
              </MobileCardList>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
