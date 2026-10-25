"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  closeSurveyCampaign,
  createSurveyCampaign,
  deleteSurveyCampaign,
  listSurveyCampaigns,
  listSurveyTemplates,
  searchHospitalsForSurvey,
  type HospitalSearchOption,
  type SurveyCampaign,
  type SurveyTemplate,
} from "@/lib/business";
import { formatTime } from "@/lib/users-admin";
import { API_BASE, getAuthToken, mapUser, type User } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
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


function reviewProgressLabel(c: SurveyCampaign) {
  const approved = c.approvedCount ?? 0;
  const pending = c.pendingReviewCount ?? 0;
  return `待审核 ${pending} · 已审核 ${approved}`;
}

function campaignStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge variant="success">进行中</Badge>;
    case "closed":
      return <Badge variant="outline">已关闭</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function SurveyCampaignsPage() {
  const confirmDlg = useConfirmDialog();
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<SurveyCampaign[]>([]);
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [collectors, setCollectors] = useState<User[]>([]);
  const [hospitalOptions, setHospitalOptions] = useState<HospitalSearchOption[]>(
    [],
  );
  const [hospitalSearching, setHospitalSearching] = useState(false);
  const [selectedHospitalMap, setSelectedHospitalMap] = useState<
    Record<string, HospitalSearchOption>
  >({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [selectedCollectorIds, setSelectedCollectorIds] = useState<string[]>([]);
  const [distributionMode, setDistributionMode] = useState<
    "hospital" | "collector_open"
  >("hospital");
  const [selectedHospitals, setSelectedHospitals] = useState<string[]>([]);
  const [hospitalKeyword, setHospitalKeyword] = useState("");

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard/surveys/tasks");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [campRes, tplRes] = await Promise.all([
      listSurveyCampaigns(),
      listSurveyTemplates(),
    ]);
    if (campRes.error) setError(campRes.error);
    setItems(campRes.items);
    setTotal(campRes.total);
    setTemplates(tplRes.items);
    setTemplateId((prev) => prev || tplRes.items[0]?.id || "");

    const token = getAuthToken();
    if (token) {
      try {
        const resp = await fetch(
          `${API_BASE}/admin/users?status=approved&page=1&pageSize=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (resp.ok) {
          const data = await resp.json();
          setCollectors(
            (data.items || [])
              .map(mapUser)
              .filter((u: User) => u.role !== "admin"),
          );
        }
      } catch {
        /* ignore */
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  // Server-side hospital search — do NOT preload a capped page (1500+ rows;
  // pageSize 200 previously hid newly created hospitals past rank ~200).
  useEffect(() => {
    if (!showForm) return;
    const kw = hospitalKeyword.trim();
    if (!kw) {
      setHospitalOptions([]);
      setHospitalSearching(false);
      return;
    }
    let cancelled = false;
    setHospitalSearching(true);
    const t = window.setTimeout(async () => {
      const res = await searchHospitalsForSurvey(kw, 40);
      if (cancelled) return;
      setHospitalSearching(false);
      if (!res.error) setHospitalOptions(res.items);
      else setHospitalOptions([]);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [hospitalKeyword, showForm]);

  const filteredHospitals = useMemo(() => {
    const byId = new Map<string, HospitalSearchOption>();
    for (const id of selectedHospitals) {
      const pinned = selectedHospitalMap[id];
      if (pinned) byId.set(id, pinned);
    }
    for (const h of hospitalOptions) byId.set(h.id, h);
    return Array.from(byId.values());
  }, [hospitalOptions, selectedHospitals, selectedHospitalMap]);

  const toggleHospital = (h: HospitalSearchOption) => {
    setSelectedHospitals((prev) => {
      if (prev.includes(h.id)) {
        setSelectedHospitalMap((m) => {
          const next = { ...m };
          delete next[h.id];
          return next;
        });
        return prev.filter((x) => x !== h.id);
      }
      setSelectedHospitalMap((m) => ({ ...m, [h.id]: h }));
      return [...prev, h.id];
    });
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !templateId) {
      setError("请填写标题并选择模板");
      return;
    }
    if (distributionMode === "hospital") {
      if (!assigneeId || selectedHospitals.length === 0) {
        setError("按医院派发：请选择采集员，并至少选择一家医院");
        return;
      }
    } else if (selectedCollectorIds.length === 0) {
      setError("发给采集员：请至少选择一名采集员");
      return;
    }
    const selectedTpl = templates.find((t) => t.id === templateId);
    const fieldCount = selectedTpl?.schema?.fields?.length ?? 0;
    if (fieldCount === 0) {
      setError("所选模板没有字段，请先在「问卷模板」中添加字段");
      return;
    }
    setSaving(true);
    setError(null);
    let dueAtIso: string | undefined;
    if (dueAt.trim()) {
      const d = new Date(dueAt);
      if (Number.isNaN(d.getTime())) {
        setSaving(false);
        setError("截止时间格式无效");
        return;
      }
      dueAtIso = d.toISOString();
    }
    const res = await createSurveyCampaign(
      distributionMode === "hospital"
        ? {
            templateId: Number(templateId),
            title: title.trim(),
            description: description.trim() || undefined,
            dueAt: dueAtIso,
            distributionMode: "hospital",
            assigneeId: Number(assigneeId),
            hospitalIds: selectedHospitals.map(Number),
          }
        : {
            templateId: Number(templateId),
            title: title.trim(),
            description: description.trim() || undefined,
            dueAt: dueAtIso,
            distributionMode: "collector_open",
            assigneeIds: selectedCollectorIds.map(Number),
          },
    );
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowForm(false);
    setTitle("");
    setDescription("");
    setDueAt("");
    setAssigneeId("");
    setSelectedCollectorIds([]);
    setDistributionMode("hospital");
    setSelectedHospitals([]);
    setSelectedHospitalMap({});
    setHospitalKeyword("");
    setHospitalOptions([]);
    await load();
  };

  const onClose = async (id: string) => {
    setSaving(true);
    const res = await closeSurveyCampaign(id);
    setSaving(false);
    if (res.error) setError(res.error);
    else await load();
  };

  const onDelete = async (c: SurveyCampaign) => {
    const approved = c.approvedCount ?? 0;
    const pending = c.pendingReviewCount ?? 0;
    const tip =
      `确定删除发放「${c.title}」？\n` +
      `将同时删除其全部任务与答卷（任务 ${c.assignmentCount} · 待审核 ${pending} · 已审核 ${approved}）。\n` +
      `注意：已审核并写入客户/设备的数据不会回滚。`;
    const ok = await confirmDlg.ask({
      title: "删除发放",
      description: tip,
      confirmLabel: "删除",
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    const res = await deleteSurveyCampaign(c.id);
    setSaving(false);
    if (res.error) setError(res.error);
    else await load();
  };

  const templateLabel = useMemo(() => {
    const map = new Map(templates.map((t) => [t.id, t.title]));
    return (id: string, fallback?: string) => map.get(id) || fallback || id;
  }, [templates]);

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Send className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>问卷发放</CardTitle>
                <CardDescription>
                  支持「按医院锁定」或「发给采集员自选医院（可重复填）」。当前共 {total} 次发放。
                </CardDescription>
              </div>
            </div>
            <PageToolbar>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                className="min-h-10 w-full sm:w-auto"
                onClick={() => setShowForm((v) => !v)}
              >
                {showForm ? (
                  <>
                    <X className="mr-1 h-4 w-4" />
                    取消
                  </>
                ) : (
                  <>
                    <Plus className="mr-1 h-4 w-4" />
                    新建发放
                  </>
                )}
              </Button>
            </PageToolbar>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {showForm ? (
            <form
              onSubmit={onCreate}
              className="space-y-4 rounded-lg border p-4"
            >
              <div className="space-y-2">
                <Label>发放方式</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted/50">
                    <input
                      type="radio"
                      name="distributionMode"
                      className="mt-1"
                      checked={distributionMode === "hospital"}
                      onChange={() => setDistributionMode("hospital")}
                    />
                    <span>
                      <span className="font-medium">按医院派发</span>
                      <span className="mt-0.5 block text-muted-foreground">
                        选定医院后锁定客户名，每家一条任务
                      </span>
                    </span>
                  </label>
                  <label className="flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted/50">
                    <input
                      type="radio"
                      name="distributionMode"
                      className="mt-1"
                      checked={distributionMode === "collector_open"}
                      onChange={() => setDistributionMode("collector_open")}
                    />
                    <span>
                      <span className="font-medium">发给采集员（自选医院）</span>
                      <span className="mt-0.5 block text-muted-foreground">
                        不锁客户名；填报时联想数据库已有医院，可重复提交
                      </span>
                    </span>
                  </label>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>标题</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：2024 化学发光装机盘点"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>模板</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择模板" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => {
                        const n = t.schema?.fields?.length ?? 0;
                        return (
                          <SelectItem key={t.id} value={t.id}>
                            {t.title}（{t.code} · {n} 字段）
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {distributionMode === "hospital" ? (
                  <div className="space-y-2">
                    <Label>采集员</Label>
                    <Select value={assigneeId} onValueChange={setAssigneeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择采集员" />
                      </SelectTrigger>
                      <SelectContent>
                        {collectors.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>截止时间（可选）</Label>
                  <Input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>说明（可选）</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {distributionMode === "collector_open" ? (
                <div className="space-y-2">
                  <Label>
                    采集员（已选 {selectedCollectorIds.length} 人，每人一条可重复填报任务）
                  </Label>
                  <div className="max-h-48 overflow-auto rounded-md border p-2">
                    {collectors.length === 0 ? (
                      <p className="p-2 text-sm text-muted-foreground">
                        暂无已审核的非管理员用户
                      </p>
                    ) : (
                      collectors.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCollectorIds.includes(c.id)}
                            onChange={() => {
                              setSelectedCollectorIds((prev) =>
                                prev.includes(c.id)
                                  ? prev.filter((x) => x !== c.id)
                                  : [...prev, c.id],
                              );
                            }}
                          />
                          <span>
                            {c.name}
                            <span className="ml-2 text-muted-foreground">
                              {c.email}
                            </span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>
                    医院（已选 {selectedHospitals.length} 家，每家生成一条任务）
                  </Label>
                  <Input
                    placeholder="输入医院名称搜索（支持客户编码）"
                    value={hospitalKeyword}
                    onChange={(e) => setHospitalKeyword(e.target.value)}
                  />
                  <div className="max-h-48 overflow-auto rounded-md border p-2">
                    {filteredHospitals.map((h) => (
                      <label
                        key={h.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={selectedHospitals.includes(h.id)}
                          onChange={() => toggleHospital(h)}
                        />
                        <span>
                          {h.name}
                          <span className="ml-2 text-muted-foreground">
                            {[h.province, h.city].filter(Boolean).join(" ")}
                          </span>
                        </span>
                      </label>
                    ))}
                    {filteredHospitals.length === 0 ? (
                      <p className="p-2 text-sm text-muted-foreground">
                        {hospitalSearching
                          ? "搜索中…"
                          : hospitalKeyword.trim()
                            ? "无匹配医院"
                            : "输入关键字搜索已有医院（含客户管理新建）"}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                创建发放
              </Button>
            </form>
          ) : null}

          <DesktopTable className="rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>模板</TableHead>
                  <TableHead>任务数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>审核</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-[160px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      暂无发放
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <div>{c.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {c.distributionMode === "collector_open"
                            ? "自选医院 · 可重复填"
                            : "按医院锁定"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {templateLabel(c.templateId, c.templateTitle)}
                      </TableCell>
                      <TableCell>{c.assignmentCount}</TableCell>
                      <TableCell>{campaignStatusBadge(c.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {reviewProgressLabel(c)}
                      </TableCell>
                      <TableCell>{formatTime(c.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {c.status === "active" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={saving}
                              onClick={() => onClose(c.id)}
                            >
                              关闭
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            disabled={saving}
                            onClick={() => onDelete(c)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            删除
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
            {loading ? (
              <li className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                加载中…
              </li>
            ) : items.length === 0 ? (
              <li className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                暂无发放
              </li>
            ) : (
              items.map((c) => (
                <MobileCardItem key={c.id}>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.distributionMode === "collector_open"
                      ? "自选医院 · 可重复填"
                      : "按医院锁定"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {templateLabel(c.templateId, c.templateTitle)}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {c.assignmentCount} 条任务
                    </span>
                    {campaignStatusBadge(c.status)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {reviewProgressLabel(c)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(c.createdAt)}
                  </div>
                  <div className="flex flex-col gap-2">
                    {c.status === "active" ? (
                      <Button
                        variant="outline"
                        className="min-h-10 w-full"
                        disabled={saving}
                        onClick={() => onClose(c.id)}
                      >
                        关闭
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      className="min-h-10 w-full text-destructive hover:bg-destructive/10"
                      disabled={saving}
                      onClick={() => onDelete(c)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </MobileCardItem>
              ))
            )}
          </MobileCardList>
        </CardContent>
      </Card>
      {confirmDlg.dialog}
    </div>
  );
}
