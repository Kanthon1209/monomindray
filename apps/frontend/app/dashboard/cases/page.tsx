"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import {
  createCase,
  deleteCase,
  listCases,
  listHospitals,
  updateCase,
  type CaseItem,
} from "@/lib/business";
import type { Hospital } from "@/lib/types";
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

const emptyForm = {
  hospitalId: "",
  title: "",
  summary: "",
  content: "",
  status: "draft",
};

function caseStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge variant="success">已通过</Badge>;
    case "submitted":
      return <Badge variant="warning">已提交</Badge>;
    case "rejected":
      return <Badge variant="destructive">已驳回</Badge>;
    default:
      return <Badge variant="outline">草稿</Badge>;
  }
}

export default function CasesPage() {
  const [items, setItems] = useState<CaseItem[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [caseRes, hospRes] = await Promise.all([
      listCases({
        keyword,
        status: statusFilter === "all" ? undefined : statusFilter,
        page: 1,
        pageSize: 100,
      }),
      listHospitals({ page: 1, pageSize: 200 }),
    ]);
    if (caseRes.error) setError(caseRes.error);
    setItems(caseRes.items);
    setTotal(caseRes.total);
    setHospitals(hospRes.items);
    setForm((prev) =>
      prev.hospitalId || !hospRes.items[0]
        ? prev
        : { ...prev, hospitalId: hospRes.items[0].id },
    );
    setLoading(false);
  }, [keyword, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm({
      ...emptyForm,
      hospitalId: hospitals[0]?.id || "",
    });
    setEditingId(null);
  };

  const payload = () => ({
    hospitalId: Number(form.hospitalId),
    title: form.title,
    summary: form.summary,
    content: form.content,
    status: form.status,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.hospitalId) {
      setError("请选择所属医院");
      return;
    }
    setSaving(true);
    setError(null);
    const res = editingId
      ? await updateCase(editingId, payload())
      : await createCase(payload());
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    resetForm();
    await load();
  };

  const onEdit = (c: CaseItem) => {
    setEditingId(c.id);
    setForm({
      hospitalId: c.hospitalId,
      title: c.title,
      summary: c.summary || "",
      content: c.content || "",
      status: c.status,
    });
  };

  const onDelete = async (id: string) => {
    if (!confirm("确认删除该案例？")) return;
    const res = await deleteCase(id);
    if (res.error) {
      setError(res.error);
      return;
    }
    await load();
  };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>案例维护</CardTitle>
                <CardDescription>产品应用价值案例。当前共 {total} 条。</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="submitted">已提交</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="rejected">已驳回</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="搜索标题"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-[160px]"
              />
              <Button variant="outline" size="icon" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>标题</Label>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>所属医院</Label>
              <Select
                value={form.hospitalId}
                onValueChange={(v) => setForm({ ...form, hospitalId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择医院" />
                </SelectTrigger>
                <SelectContent>
                  {hospitals.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="submitted">已提交</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="rejected">已驳回</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>摘要</Label>
              <Input
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>正文</Label>
              <textarea
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {editingId ? "保存修改" : "新增案例"}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={resetForm}>
                  取消
                </Button>
              ) : null}
            </div>
          </form>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>案例</TableHead>
                  <TableHead>医院</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      暂无案例
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {c.summary || "-"}
                        </div>
                      </TableCell>
                      <TableCell>{c.hospitalName || "-"}</TableCell>
                      <TableCell>{caseStatusBadge(c.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => onEdit(c)}>
                            编辑
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => onDelete(c.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
