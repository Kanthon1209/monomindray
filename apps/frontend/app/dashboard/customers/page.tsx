"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2, Users } from "lucide-react";

import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  listHospitals,
  updateCustomer,
  type Customer,
} from "@/lib/business";
import type { Hospital } from "@/lib/types";
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
  hospitalId: "none",
  name: "",
  title: "",
  phone: "",
  email: "",
  remark: "",
};

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [custRes, hospRes] = await Promise.all([
      listCustomers({ keyword, page: 1, pageSize: 100 }),
      listHospitals({ page: 1, pageSize: 200 }),
    ]);
    if (custRes.error) setError(custRes.error);
    setItems(custRes.items);
    setTotal(custRes.total);
    setHospitals(hospRes.items);
    setLoading(false);
  }, [keyword]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const payload = () => ({
    hospitalId: form.hospitalId === "none" ? null : Number(form.hospitalId),
    name: form.name,
    title: form.title,
    phone: form.phone,
    email: form.email,
    remark: form.remark,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = editingId
      ? await updateCustomer(editingId, payload())
      : await createCustomer(payload());
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    resetForm();
    await load();
  };

  const onEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({
      hospitalId: c.hospitalId || "none",
      name: c.name,
      title: c.title || "",
      phone: c.phone || "",
      email: c.email || "",
      remark: c.remark || "",
    });
  };

  const onDelete = async (id: string) => {
    if (!confirm("确认删除该客户？")) return;
    const res = await deleteCustomer(id);
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
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>客户管理</CardTitle>
                <CardDescription>维护医院联系人。当前共 {total} 人。</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="搜索姓名/电话"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-[180px]"
              />
              <Button variant="outline" size="icon" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <form
            onSubmit={onSubmit}
            className="grid gap-3 rounded-lg border p-4 md:grid-cols-3 lg:grid-cols-4"
          >
            <div className="space-y-1.5">
              <Label>姓名</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>职务/科室</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>电话</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>邮箱</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>挂靠医院</Label>
              <Select
                value={form.hospitalId}
                onValueChange={(v) => setForm({ ...form, hospitalId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="可选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联</SelectItem>
                  {hospitals.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {editingId ? "保存修改" : "新增客户"}
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
                  <TableHead>客户</TableHead>
                  <TableHead>医院</TableHead>
                  <TableHead>联系方式</TableHead>
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
                      暂无客户
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.title || "-"}</div>
                      </TableCell>
                      <TableCell>{c.hospitalName || "-"}</TableCell>
                      <TableCell className="text-sm">
                        {c.phone || "-"}
                        <div className="text-xs text-muted-foreground">{c.email || ""}</div>
                      </TableCell>
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
