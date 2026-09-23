"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Hospital as HospitalIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  createDevice,
  createHospital,
  deleteDevice,
  deleteHospital,
  listDevices,
  listHospitals,
  updateHospital,
  type Device,
} from "@/lib/business";
import { filterOptions } from "@/lib/mock-data";
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

const levels = filterOptions.hospitalLevel.filter((x) => x.value !== "all").map((x) => x.label);
const types = filterOptions.hospitalType.filter((x) => x.value !== "all").map((x) => x.label);
const categories = filterOptions.deviceCategory.filter((x) => x.value !== "all");
const models = filterOptions.deviceModel.filter((x) => x.value !== "all").map((x) => x.label);

const emptyForm = {
  name: "",
  province: "",
  city: "",
  district: "",
  level: "三级甲等",
  type: "综合医院",
  status: "active",
  address: "",
  remark: "",
};

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="success">运营中</Badge>;
  if (status === "pending") return <Badge variant="warning">待确认</Badge>;
  return <Badge variant="secondary">停用</Badge>;
}

export default function HospitalsPage() {
  const [items, setItems] = useState<Hospital[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceForm, setDeviceForm] = useState({
    category: "biochem",
    model: "BS-2000M",
    serialNo: "",
    status: "active",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listHospitals({ keyword, page: 1, pageSize: 100 });
    if (res.error) setError(res.error);
    setItems(res.items);
    setTotal(res.total);
    setLoading(false);
  }, [keyword]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDevices = useCallback(async (hospitalId: string) => {
    const res = await listDevices(hospitalId);
    if (res.error) setError(res.error);
    setDevices(res.items);
  }, []);

  useEffect(() => {
    if (selectedId) loadDevices(selectedId);
    else setDevices([]);
  }, [selectedId, loadDevices]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = editingId
      ? await updateHospital(editingId, form)
      : await createHospital(form);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    resetForm();
    await load();
  };

  const onEdit = (h: Hospital) => {
    setEditingId(h.id);
    setForm({
      name: h.name,
      province: h.province,
      city: h.city,
      district: "",
      level: h.level,
      type: h.type,
      status: h.status,
      address: "",
      remark: "",
    });
  };

  const onDelete = async (id: string) => {
    if (!confirm("确认删除该医院？关联设备会一并删除。")) return;
    const res = await deleteHospital(id);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await load();
  };

  const onAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    const res = await createDevice(selectedId, deviceForm);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDeviceForm({ category: "biochem", model: "BS-2000M", serialNo: "", status: "active" });
    await loadDevices(selectedId);
    await load();
  };

  const onDeleteDevice = async (id: string) => {
    if (!confirm("确认删除该设备？")) return;
    const res = await deleteDevice(id);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (selectedId) {
      await loadDevices(selectedId);
      await load();
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <HospitalIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>医院管理</CardTitle>
                <CardDescription>维护医院档案与下属设备。当前共 {total} 家。</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="搜索医院/城市"
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
            <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
              <Label>医院名称</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>省份</Label>
              <Input
                required
                placeholder="如 广东省"
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>城市</Label>
              <Input
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>级别</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">运营中</SelectItem>
                  <SelectItem value="pending">待确认</SelectItem>
                  <SelectItem value="inactive">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {editingId ? "保存修改" : "新增医院"}
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
                  <TableHead>医院</TableHead>
                  <TableHead>级别/类型</TableHead>
                  <TableHead>设备</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      暂无医院数据
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((h) => (
                    <TableRow
                      key={h.id}
                      className={selectedId === h.id ? "bg-muted/40" : undefined}
                    >
                      <TableCell>
                        <div className="font-medium">{h.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {h.province} · {h.city}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {h.level}
                        <br />
                        <span className="text-muted-foreground">{h.type}</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {h.deviceCount} 台
                        <div className="text-xs text-muted-foreground">
                          {(h.deviceModels || []).slice(0, 3).join("、") || "-"}
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(h.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setSelectedId(h.id)}>
                            设备
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onEdit(h)}>
                            编辑
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => onDelete(h.id)}>
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

          {selectedId ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  设备列表 · {items.find((x) => x.id === selectedId)?.name}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                  关闭
                </Button>
              </div>
              <form onSubmit={onAddDevice} className="grid gap-3 md:grid-cols-5">
                <Select
                  value={deviceForm.category}
                  onValueChange={(v) => setDeviceForm({ ...deviceForm, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="类别" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={deviceForm.model}
                  onValueChange={(v) => setDeviceForm({ ...deviceForm, model: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="型号" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="序列号"
                  value={deviceForm.serialNo}
                  onChange={(e) => setDeviceForm({ ...deviceForm, serialNo: e.target.value })}
                />
                <Button type="submit" disabled={saving}>
                  添加设备
                </Button>
              </form>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类别</TableHead>
                    <TableHead>型号</TableHead>
                    <TableHead>序列号</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        暂无设备
                      </TableCell>
                    </TableRow>
                  ) : (
                    devices.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>{d.category}</TableCell>
                        <TableCell>{d.model}</TableCell>
                        <TableCell>{d.serialNo || "-"}</TableCell>
                        <TableCell>{d.status}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDeleteDevice(d.id)}
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
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
