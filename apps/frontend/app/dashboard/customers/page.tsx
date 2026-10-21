"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  createDeviceGlobal,
  createHospital,
  deleteDevice,
  deleteHospital,
  getHospital,
  listAllDevices,
  listDevices,
  listHospitals,
  updateDevice,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ComboboxInput } from "@/components/ui/combobox-input";
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
import {
  CHINA_PROVINCES,
  allCities,
  citiesForProvince,
} from "@/lib/china-regions";

const levels = filterOptions.hospitalLevel
  .filter((x) => x.value !== "all")
  .map((x) => x.label);
const hospitalTypes = filterOptions.hospitalType
  .filter((x) => x.value !== "all")
  .map((x) => x.label);
const institutionTypes = [
  "第三方实验室",
  "疾控中心",
  "体检中心",
  "科研院所",
  "其他机构",
];
const categories = filterOptions.deviceCategory.filter((x) => x.value !== "all");

type CustomerKind = "hospital" | "institution";

function kindFromType(type: string): CustomerKind {
  return institutionTypes.includes(type) ? "institution" : "hospital";
}

function kindLabel(kind: CustomerKind) {
  return kind === "institution" ? "机构" : "医院";
}

const categoryLabel: Record<string, string> = {
  biochem: "生化",
  immuno: "免疫",
  hematology: "血液",
  coag: "凝血",
  urine: "尿沉渣",
};

const emptyForm = {
  kind: "hospital" as CustomerKind,
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

function withKind(
  prev: typeof emptyForm,
  kind: CustomerKind,
): typeof emptyForm {
  if (kind === "institution") {
    return {
      ...prev,
      kind,
      type: institutionTypes.includes(prev.type) ? prev.type : institutionTypes[0],
      level: "不适用",
    };
  }
  return {
    ...prev,
    kind,
    type: hospitalTypes.includes(prev.type) ? prev.type : "综合医院",
    level: prev.level && prev.level !== "不适用" ? prev.level : "三级甲等",
  };
}

const emptyDeviceForm = {
  brand: "迈瑞",
  category: "immuno",
  model: "",
  serialNo: "",
  status: "active",
};

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="success">运营中</Badge>;
  if (status === "pending") return <Badge variant="warning">待确认</Badge>;
  return <Badge variant="secondary">停用</Badge>;
}

function deviceLabel(d: Device) {
  const parts = [d.brand, d.model, d.serialNo].filter(Boolean);
  const where = d.hospitalName ? ` · ${d.hospitalName}` : "";
  return `${parts.join(" / ")}${where}`;
}

export default function CustomersPage() {
  const [items, setItems] = useState<Hospital[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [deviceMode, setDeviceMode] = useState<"pick" | "create">("pick");
  const [poolKeyword, setPoolKeyword] = useState("");
  const [pool, setPool] = useState<Device[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [deviceForm, setDeviceForm] = useState(emptyDeviceForm);

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
    setDevicesLoading(true);
    const res = await listDevices(hospitalId);
    if (res.error) setError(res.error);
    setDevices(res.items);
    setDevicesLoading(false);
  }, []);

  const loadPool = useCallback(async (kw: string) => {
    setPoolLoading(true);
    const res = await listAllDevices({
      keyword: kw || undefined,
      page: 1,
      pageSize: 50,
    });
    if (res.error) setError(res.error);
    setPool(res.items);
    setPoolLoading(false);
  }, []);

  useEffect(() => {
    if (!addDeviceOpen || deviceMode !== "pick") return;
    const t = setTimeout(() => loadPool(poolKeyword), 200);
    return () => clearTimeout(t);
  }, [addDeviceOpen, deviceMode, poolKeyword, loadPool]);

  const hospitalDevicesIds = useMemo(
    () => new Set(devices.map((d) => d.id)),
    [devices],
  );

  const provinceOptions = useMemo(() => {
    const fromData = items.map((h) => h.province).filter(Boolean);
    return Array.from(new Set([...CHINA_PROVINCES, ...fromData]));
  }, [items]);

  const cityOptions = useMemo(() => {
    const fromProvince = citiesForProvince(form.province);
    const fromData = items
      .filter((h) => !form.province || h.province === form.province)
      .map((h) => h.city)
      .filter(Boolean);
    const base = fromProvince.length > 0 ? fromProvince : allCities();
    return Array.from(new Set([...base, ...fromData]));
  }, [form.province, items]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDevices([]);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = async (h: Hospital) => {
    setError(null);
    setEditingId(h.id);
    setForm({
      kind: kindFromType(h.type),
      name: h.name,
      province: h.province,
      city: h.city,
      district: h.district || "",
      level: h.level,
      type: h.type,
      status: h.status,
      address: h.address || "",
      remark: h.remark || "",
    });
    setDialogOpen(true);
    setDevicesLoading(true);
    const detail = await getHospital(h.id);
    if (detail.hospital) {
      const full = detail.hospital;
      setForm({
        kind: kindFromType(full.type),
        name: full.name,
        province: full.province,
        city: full.city,
        district: full.district || "",
        level: full.level,
        type: full.type,
        status: full.status,
        address: full.address || "",
        remark: full.remark || "",
      });
    } else if (detail.error) {
      setError(detail.error);
    }
    await loadDevices(h.id);
  };

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setForm(emptyForm);
      setDevices([]);
      setAddDeviceOpen(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { kind, ...payload } = form;
    void kind;
    const res = editingId
      ? await updateHospital(editingId, payload)
      : await createHospital(payload);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await load();
    if (!editingId && res.hospital) {
      setEditingId(res.hospital.id);
      await loadDevices(res.hospital.id);
    } else if (editingId) {
      closeDialog(false);
    }
  };

  const onDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("确认删除该客户？关联设备会一并删除。")) return;
    const res = await deleteHospital(id);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (editingId === id) closeDialog(false);
    await load();
  };

  const openAddDevice = () => {
    setDeviceMode("pick");
    setPoolKeyword("");
    setSelectedPoolId(null);
    setDeviceForm(emptyDeviceForm);
    setAddDeviceOpen(true);
  };

  const onAttachExisting = async () => {
    if (!editingId || !selectedPoolId) return;
    const picked = pool.find((d) => d.id === selectedPoolId);
    if (!picked) return;
    if (picked.hospitalId === editingId) {
      setError("该设备已属于当前客户");
      return;
    }
    const from = picked.hospitalName || "其他客户";
    if (
      !confirm(
        `将设备「${picked.brand} ${picked.model}${picked.serialNo ? " / " + picked.serialNo : ""}」从「${from}」改挂到当前客户？`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateDevice(picked.id, {
      hospitalId: Number(editingId),
      brand: picked.brand,
      category: picked.category,
      model: picked.model,
      serialNo: picked.serialNo,
      status: picked.status,
      installedAt: picked.installedAt,
      remark: picked.remark,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAddDeviceOpen(false);
    await loadDevices(editingId);
    await load();
  };

  const onCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    if (!deviceForm.model.trim()) {
      setError("请填写型号");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createDeviceGlobal({
      hospitalId: Number(editingId),
      brand: deviceForm.brand,
      category: deviceForm.category,
      model: deviceForm.model.trim(),
      serialNo: deviceForm.serialNo.trim() || undefined,
      status: deviceForm.status,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAddDeviceOpen(false);
    setDeviceForm(emptyDeviceForm);
    await loadDevices(editingId);
    await load();
  };

  const onDeleteDevice = async (id: string) => {
    if (!confirm("确认从该客户移除并删除此设备实例？")) return;
    const res = await deleteDevice(id);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (editingId) {
      await loadDevices(editingId);
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
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>客户管理</CardTitle>
                <CardDescription>
                  维护医院与机构客户，以及装机设备。当前共 {total} 家。
                </CardDescription>
              </div>
            </div>
            <PageToolbar>
              <Input
                placeholder="搜索客户/城市"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full sm:w-[180px]"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
              <Button className="min-h-10 w-full sm:w-auto" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                新增客户
              </Button>
            </PageToolbar>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {error && !dialogOpen ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客户</TableHead>
                  <TableHead>类别/类型</TableHead>
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
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      暂无客户
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((h) => (
                    <TableRow
                      key={h.id}
                      className="cursor-pointer"
                      onClick={() => openEdit(h)}
                    >
                      <TableCell>
                        <div className="font-medium">{h.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {kindLabel(kindFromType(h.type))} · {h.province} · {h.city}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {kindFromType(h.type) === "hospital" ? h.level : "机构"}
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
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => onDelete(h.id, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DesktopTable>

          <MobileCardList>
            {loading ? (
              <li className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </li>
            ) : items.length === 0 ? (
              <li className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                暂无客户
              </li>
            ) : (
              items.map((h) => (
                <MobileCardItem key={h.id}>
                  <div className="flex w-full items-start gap-2">
                    <button
                      type="button"
                      className="flex min-h-10 min-w-0 flex-1 flex-col gap-1.5 text-left"
                      onClick={() => openEdit(h)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{h.name}</span>
                        {statusBadge(h.status)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {kindLabel(kindFromType(h.type))} · {h.province} · {h.city}
                      </span>
                      <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                        <span>
                          {kindFromType(h.type) === "hospital" ? h.level : h.type}
                        </span>
                        <span>{h.deviceCount} 台</span>
                      </div>
                    </button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-10 w-10 shrink-0"
                      onClick={(e) => onDelete(h.id, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </MobileCardItem>
              ))
            )}
          </MobileCardList>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{editingId ? "编辑客户" : "新增客户"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "修改客户信息，并从已有设备实例中关联装机。"
                : "填写医院或机构的基础信息，保存后可继续添加设备。"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>客户类别</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) =>
                    setForm((prev) => withKind(prev, v as CustomerKind))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hospital">医院</SelectItem>
                    <SelectItem value="institution">机构</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>客户名称</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>省份</Label>
                <ComboboxInput
                  required
                  placeholder="选择或输入省份"
                  value={form.province}
                  options={provinceOptions}
                  onChange={(province) =>
                    setForm((prev) => {
                      if (province === prev.province) return prev;
                      const cities = citiesForProvince(province);
                      // 仅在选中完整已知省时，清掉不兼容的城市；输入过程中保留
                      const exactKnown = CHINA_PROVINCES.includes(province);
                      return {
                        ...prev,
                        province,
                        city:
                          exactKnown &&
                          cities.length > 0 &&
                          prev.city &&
                          !cities.includes(prev.city)
                            ? ""
                            : prev.city,
                      };
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>城市</Label>
                <ComboboxInput
                  required
                  placeholder="选择或输入城市"
                  value={form.city}
                  options={cityOptions}
                  onChange={(city) => setForm({ ...form, city })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>区县</Label>
                <Input
                  value={form.district}
                  onChange={(e) =>
                    setForm({ ...form, district: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>地址</Label>
                <Input
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </div>
              {form.kind === "hospital" ? (
                <div className="space-y-1.5">
                  <Label>级别</Label>
                  <Select
                    value={form.level}
                    onValueChange={(v) => setForm({ ...form, level: v })}
                  >
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
              ) : null}
              <div className="space-y-1.5">
                <Label>类型</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(form.kind === "institution" ? institutionTypes : hospitalTypes).map(
                      (t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ),
                    )}
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
                    <SelectItem value="active">运营中</SelectItem>
                    <SelectItem value="pending">待确认</SelectItem>
                    <SelectItem value="inactive">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>备注</Label>
                <Input
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                />
              </div>
            </div>

            {editingId ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">装机设备</div>
                    <div className="text-xs text-muted-foreground">
                      从已有设备实例中选择；没有则即时创建。
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={openAddDevice}
                  >
                    <Plus className="h-4 w-4" />
                    添加设备
                  </Button>
                </div>
                {devicesLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : devices.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    暂无设备
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>品牌</TableHead>
                        <TableHead>型号</TableHead>
                        <TableHead>序列号</TableHead>
                        <TableHead>类别</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {devices.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>{d.brand}</TableCell>
                          <TableCell>{d.model}</TableCell>
                          <TableCell>{d.serialNo || "-"}</TableCell>
                          <TableCell>
                            {categoryLabel[d.category] || d.category}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => onDeleteDevice(d.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ) : null}

            <DialogFooter className="gap-2 border-t px-0 pt-4 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => closeDialog(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {editingId ? "保存" : "创建并继续"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addDeviceOpen} onOpenChange={setAddDeviceOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>添加设备</DialogTitle>
            <DialogDescription>
              优先从已有设备实例中选择；若列表中没有，可即时新建实例。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={deviceMode === "pick" ? "default" : "outline"}
                onClick={() => setDeviceMode("pick")}
              >
                选择已有实例
              </Button>
              <Button
                type="button"
                size="sm"
                variant={deviceMode === "create" ? "default" : "outline"}
                onClick={() => setDeviceMode("create")}
              >
                即时创建
              </Button>
            </div>

            {deviceMode === "pick" ? (
              <div className="space-y-3">
                <Input
                  placeholder="搜索品牌 / 型号 / 序列号 / 客户"
                  value={poolKeyword}
                  onChange={(e) => setPoolKeyword(e.target.value)}
                />
                <div className="max-h-64 overflow-auto rounded-md border">
                  {poolLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : pool.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      未找到设备实例，可切换到「即时创建」
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {pool.map((d) => {
                        const already = hospitalDevicesIds.has(d.id);
                        const selected = selectedPoolId === d.id;
                        return (
                          <li key={d.id}>
                            <button
                              type="button"
                              disabled={already}
                              className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50 ${
                                selected ? "bg-muted" : ""
                              }`}
                              onClick={() => setSelectedPoolId(d.id)}
                            >
                              <span className="font-medium">
                                {deviceLabel(d)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {categoryLabel[d.category] || d.category}
                                {already ? " · 已在本院" : ""}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <DialogFooter className="gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddDeviceOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    disabled={!selectedPoolId || saving}
                    onClick={onAttachExisting}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    关联到本院
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={onCreateDevice} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>品牌</Label>
                    <Input
                      value={deviceForm.brand}
                      onChange={(e) =>
                        setDeviceForm({ ...deviceForm, brand: e.target.value })
                      }
                      placeholder="迈瑞 / 罗氏 / …"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>类别</Label>
                    <Select
                      value={deviceForm.category}
                      onValueChange={(v) =>
                        setDeviceForm({ ...deviceForm, category: v })
                      }
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
                  <div className="space-y-1.5">
                    <Label>型号</Label>
                    <Input
                      required
                      value={deviceForm.model}
                      onChange={(e) =>
                        setDeviceForm({ ...deviceForm, model: e.target.value })
                      }
                      placeholder="如 CL-8000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>序列号（可选）</Label>
                    <Input
                      value={deviceForm.serialNo}
                      onChange={(e) =>
                        setDeviceForm({
                          ...deviceForm,
                          serialNo: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddDeviceOpen(false)}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    创建并关联
                  </Button>
                </DialogFooter>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
