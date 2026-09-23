"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Send, X } from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  closeSurveyCampaign,
  createSurveyCampaign,
  listSurveyCampaigns,
  listSurveyTemplates,
  type SurveyCampaign,
  type SurveyTemplate,
} from "@/lib/business";
import { formatTime } from "@/lib/users-admin";
import { API_BASE, getAuthToken, mapUser, readError, type User } from "@/lib/auth";
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
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<SurveyCampaign[]>([]);
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [collectors, setCollectors] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const [lockedKeys, setLockedKeys] = useState<string[]>([]);

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

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId],
  );

  const prefillFields = useMemo(() => {
    const fields = selectedTemplate?.schema?.fields || [];
    // Prefer hospital master data first, then fields that already have defaults.
    const hospital = fields.filter((f) => (f.section || "").includes("医院"));
    const rest = fields.filter((f) => !(f.section || "").includes("医院"));
    return [...hospital, ...rest].slice(0, 12);
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate) {
      setPrefill({});
      setLockedKeys([]);
      return;
    }
    const next: Record<string, string> = {};
    const locks: string[] = [];
    for (const f of selectedTemplate.schema?.fields || []) {
      if (f.default) next[f.key] = f.default;
      if (f.locked) locks.push(f.key);
    }
    setPrefill(next);
    setLockedKeys(locks);
  }, [selectedTemplate]);

  const toggleLock = (key: string) => {
    setLockedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const toggleAssignee = (id: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !templateId || selectedAssignees.length === 0) {
      setError("请填写标题、选择模板，并至少选择一名采集员");
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
    const defaults: Record<string, string> = {};
    for (const [k, v] of Object.entries(prefill)) {
      const trimmed = v.trim();
      if (trimmed) defaults[k] = trimmed;
    }
    const res = await createSurveyCampaign({
      templateId: Number(templateId),
      title: title.trim(),
      description: description.trim() || undefined,
      dueAt: dueAtIso,
      defaults,
      lockedKeys: lockedKeys.filter((k) => defaults[k]),
      assigneeIds: selectedAssignees.map(Number),
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowForm(false);
    setTitle("");
    setDescription("");
    setDueAt("");
    setSelectedAssignees([]);
    setPrefill({});
    setLockedKeys([]);
    await load();
  };

  const onClose = async (id: string) => {
    setSaving(true);
    const res = await closeSurveyCampaign(id);
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
                  选择模板并分发给采集员。当前共 {total} 次发放。
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button onClick={() => setShowForm((v) => !v)}>
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {showForm ? (
            <form
              onSubmit={onCreate}
              className="space-y-4 rounded-lg border p-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>标题</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：2026 安徽化免摸底"
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
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}（{t.code}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>说明（可选）</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="给采集员的补充说明"
                  />
                </div>
                <div className="space-y-2">
                  <Label>截止时间（可选）</Label>
                  <Input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </div>
              </div>
              {prefillFields.length > 0 ? (
                <div className="space-y-2">
                  <Label>预填与锁定（可选）</Label>
                  <p className="text-xs text-muted-foreground">
                    例如固化医院名称后勾选「锁定」，采集员打开任务时已填好且不可改。
                  </p>
                  <div className="max-h-64 space-y-2 overflow-auto rounded-md border p-3">
                    {prefillFields.map((f) => (
                      <div
                        key={f.key}
                        className="grid items-center gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
                      >
                        <span className="truncate text-sm">{f.label}</span>
                        <Input
                          value={prefill[f.key] || ""}
                          onChange={(e) =>
                            setPrefill((prev) => ({
                              ...prev,
                              [f.key]: e.target.value,
                            }))
                          }
                          placeholder={`预填 ${f.key}`}
                        />
                        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={lockedKeys.includes(f.key)}
                            disabled={!(prefill[f.key] || "").trim()}
                            onChange={() => toggleLock(f.key)}
                          />
                          锁定
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>采集员（已选 {selectedAssignees.length} 人）</Label>
                <div className="max-h-48 overflow-auto rounded-md border p-2">
                  {collectors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      暂无已通过审核的采集员
                    </p>
                  ) : (
                    collectors.map((c) => {
                      const checked = selectedAssignees.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAssignee(c.id)}
                          />
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground">{c.email}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                创建并发放
              </Button>
            </form>
          ) : null}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>模板</TableHead>
                  <TableHead>任务数</TableHead>
                  <TableHead>截止</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
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
                      暂无发放记录
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>
                        {item.templateTitle ||
                          templateLabel(item.templateId, item.templateCode)}
                      </TableCell>
                      <TableCell>{item.assignmentCount}</TableCell>
                      <TableCell>{formatTime(item.dueAt)}</TableCell>
                      <TableCell>{campaignStatusBadge(item.status)}</TableCell>
                      <TableCell>{formatTime(item.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {item.status === "active" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={saving}
                            onClick={() => onClose(item.id)}
                          >
                            关闭
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
