"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Cpu,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  createDeviceGlobal,
  deleteDevice,
  listAllDevices,
  listHospitals,
  type Device,
} from "@/lib/business";
import { filterOptions } from "@/lib/mock-data";
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

const categories = filterOptions.deviceCategory.filter((x) => x.value !== "all");

const categoryLabel: Record<string, string> = {
  biochem: "生化",
  immuno: "免疫",
  hematology: "血液",
  coag: "凝血",
  urine: "尿沉渣",
};

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="success">在用</Badge>;
  if (status === "maintenance") return <Badge variant="warning">维护</Badge>;
  return <Badge variant="secondary">停用</Badge>;
}

export default function DevicesPage() {
  const [items, setItems] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hospitals, setHospitals] = useState<
    { id: string; name: string }[]
  >([]);
  const [form, setForm] = useState({
    hospitalId: "",
    brand: "迈瑞",
    category: "immuno",
    model: "",
    serialNo: "",
    status: "active",
    installedAt: "",
    remark: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAllDevices({
      keyword: keyword || undefined,
      brand: brandFilter === "all" ? undefined : brandFilter,
      category: categoryFilter === "all" ? undefined : categoryFilter,
      page: 1,
      pageSize: 100,
    });
    if (res.error) setError(res.error);
    setItems(res.items);
    setTotal(res.total);
    setLoading(false);
  }, [keyword, brandFilter, categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listHospitals({ page: 1, pageSize: 200 }).then((res) => {
      setHospitals((res.items || []).map((h) => ({ id: h.id, name: h.name })));
    });
  }, []);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.hospitalId || !form.model.trim()) {
      setError("请选择医院并填写型号");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createDeviceGlobal({
      hospitalId: Number(form.hospitalId),
      brand: form.brand.trim() || "迈瑞",
      category: form.category,
      model: form.model.trim(),
      serialNo: form.serialNo.trim() || undefined,
      status: form.status,
      installedAt: form.installedAt || undefined,
      remark: form.remark.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowForm(false);
    setForm({
      hospitalId: "",
      brand: "迈瑞",
      category: "immuno",
      model: "",
      serialNo: "",
      status: "active",
      installedAt: "",
      remark: "",
    });
    await load();
  };

  const onDelete = async (id: string) => {
    if (!confirm("确认删除该设备？")) return;
    const res = await deleteDevice(id);
    if (res.error) setError(res.error);
    else await load();
  };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Cpu className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>设备管理</CardTitle>
                <CardDescription>
                  迈瑞与竞品装机统一列表。当前共 {total} 台。
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button onClick={() => setShowForm((v) => !v)}>
                <Plus className="mr-1 h-4 w-4" />
                {showForm ? "取消" : "新建设备"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="搜索医院/型号/序列号/品牌"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="品牌" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部品牌</SelectItem>
                <SelectItem value="迈瑞">迈瑞</SelectItem>
                <SelectItem value="竞品">竞品（非迈瑞）</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="产线" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部产线</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showForm ? (
            <form onSubmit={onCreate} className="space-y-3 rounded-lg border p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>医院</Label>
                  <Select
                    value={form.hospitalId}
                    onValueChange={(v) => setForm((f) => ({ ...f, hospitalId: v }))}
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
                <div className="space-y-2">
                  <Label>品牌</Label>
                  <Input
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                    placeholder="迈瑞 / 罗氏 / 雅培…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>产线</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>型号</Label>
                  <Input
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>序列号</Label>
                  <Input
                    value={form.serialNo}
                    onChange={(e) => setForm((f) => ({ ...f, serialNo: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>安装日期</Label>
                  <Input
                    type="date"
                    value={form.installedAt}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, installedAt: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>备注</Label>
                <Input
                  value={form.remark}
                  onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                保存
              </Button>
            </form>
          ) : null}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>医院</TableHead>
                  <TableHead>品牌</TableHead>
                  <TableHead>产线</TableHead>
                  <TableHead>型号</TableHead>
                  <TableHead>序列号</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>安装日期</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      暂无设备
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.hospitalName || d.hospitalId}
                      </TableCell>
                      <TableCell>
                        {d.brand === "迈瑞" ? (
                          <Badge variant="outline">迈瑞</Badge>
                        ) : (
                          <Badge variant="secondary">{d.brand || "竞品"}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {categoryLabel[d.category] || d.category}
                      </TableCell>
                      <TableCell>{d.model}</TableCell>
                      <TableCell>{d.serialNo || "—"}</TableCell>
                      <TableCell>{statusBadge(d.status)}</TableCell>
                      <TableCell>{d.installedAt || "—"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(d.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
