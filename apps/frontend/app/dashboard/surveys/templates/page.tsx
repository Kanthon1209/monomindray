"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  LayoutTemplate,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  listSurveyTemplates,
  createSurveyTemplate,
  updateSurveyTemplate,
  type SurveyField,
  type SurveySchema,
  type SurveyTemplate,
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

const TARGET_PRESETS = [
  { value: "", label: "不映射（仅采集）" },
  { value: "hospital.name", label: "hospital.name" },
  { value: "hospital.province", label: "hospital.province" },
  { value: "hospital.city", label: "hospital.city" },
  { value: "hospital.district", label: "hospital.district" },
  { value: "hospital.level", label: "hospital.level" },
  { value: "hospital.type", label: "hospital.type" },
  { value: "hospital.address", label: "hospital.address" },
  { value: "hospital.archive.", label: "hospital.archive.（自定义后缀）" },
];

type FieldDraft = {
  key: string;
  label: string;
  section: string;
  required: boolean;
  type: string;
  target: string;
  customArchiveKey: string;
  defaultValue: string;
  locked: boolean;
};

const emptyFieldDraft = (section: string): FieldDraft => ({
  key: "",
  label: "",
  section,
  required: false,
  type: "text",
  target: "",
  customArchiveKey: "",
  defaultValue: "",
  locked: false,
});

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge variant="success">启用</Badge>;
    case "archived":
      return <Badge variant="outline">已归档</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function slugifyKey(label: string): string {
  const ascii = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (ascii) return ascii;
  return `field_${Date.now().toString(36)}`;
}

function normalizeSchema(schema: SurveySchema | undefined): SurveySchema {
  const fields = schema?.fields || [];
  const fromFields: string[] = [];
  for (const f of fields) {
    const s = (f.section || "未分组").trim() || "未分组";
    if (!fromFields.includes(s)) fromFields.push(s);
  }
  const sections = (schema?.sections || []).map((s) => s.trim()).filter(Boolean);
  const ordered = [...sections];
  for (const s of fromFields) {
    if (!ordered.includes(s)) ordered.push(s);
  }
  return { fields, sections: ordered };
}

function groupBySection(schema: SurveySchema): { section: string; fields: SurveyField[] }[] {
  const normalized = normalizeSchema(schema);
  return (normalized.sections || []).map((section) => ({
    section,
    fields: (normalized.fields || []).filter(
      (f) => (f.section || "未分组").trim() === section,
    ),
  }));
}

function draftFromField(field: SurveyField): FieldDraft {
  const target = field.target || "";
  let preset = target;
  let customArchiveKey = "";
  if (target.startsWith("hospital.archive.")) {
    preset = "hospital.archive.";
    customArchiveKey = target.slice("hospital.archive.".length);
  } else if (target && !TARGET_PRESETS.some((p) => p.value === target)) {
    preset = "hospital.archive.";
    customArchiveKey = target.startsWith("hospital.archive.")
      ? target.slice("hospital.archive.".length)
      : target;
  }
  return {
    key: field.key,
    label: field.label,
    section: field.section || "未分组",
    required: !!field.required,
    type: field.type || "text",
    target: preset,
    customArchiveKey,
    defaultValue: field.default || "",
    locked: !!field.locked,
  };
}

function resolveTarget(draft: FieldDraft): string | undefined {
  if (!draft.target) return undefined;
  if (draft.target === "hospital.archive.") {
    const key = draft.customArchiveKey.trim();
    return key ? `hospital.archive.${key}` : undefined;
  }
  return draft.target;
}

export default function SurveyTemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<SurveyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [fieldMode, setFieldMode] = useState<"create" | "edit">("create");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingOriginalKey, setEditingOriginalKey] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState<FieldDraft>(emptyFieldDraft(""));

  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [sectionTemplateId, setSectionTemplateId] = useState<string | null>(null);
  const [renamingSection, setRenamingSection] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    code: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard/surveys/tasks");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listSurveyTemplates();
    if (res.error) setError(res.error);
    setItems(res.items);
    setExpanded((prev) => prev || res.items[0]?.id || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  const editingTemplate = useMemo(
    () => items.find((t) => t.id === editingTemplateId) || null,
    [items, editingTemplateId],
  );

  const sectionOptions = useMemo(() => {
    if (!editingTemplate) return [] as string[];
    return normalizeSchema(editingTemplate.schema).sections || [];
  }, [editingTemplate]);

  const persistSchema = async (
    template: SurveyTemplate,
    nextSchema: SurveySchema,
    extras?: { title?: string; description?: string },
  ) => {
    const schema = normalizeSchema(nextSchema);
    setSaving(true);
    setError(null);
    const res = await updateSurveyTemplate(template.id, {
      title: extras?.title ?? template.title,
      description: extras?.description ?? template.description ?? "",
      schema,
      status: template.status,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return false;
    }
    setItems((prev) =>
      prev.map((t) => (t.id === template.id ? res.template! : t)),
    );
    return true;
  };

  const openCreateTemplate = () => {
    setCreateDraft({ title: "", code: "", description: "" });
    setCreateOpen(true);
  };

  const onCreateTemplate = async () => {
    const title = createDraft.title.trim();
    const code = createDraft.code.trim();
    if (!title || !code) {
      setError("请填写模板标题与编码");
      return;
    }
    setCreating(true);
    setError(null);
    const res = await createSurveyTemplate({
      title,
      code,
      description: createDraft.description.trim() || undefined,
      schema: { fields: [], sections: ["未分组"] },
    });
    setCreating(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCreateOpen(false);
    setItems((prev) => [...prev, res.template!]);
    setExpanded(res.template!.id);
  };

  const openCreateField = (template: SurveyTemplate, section: string) => {
    setEditingTemplateId(template.id);
    setFieldMode("create");
    setEditingOriginalKey(null);
    setFieldDraft(emptyFieldDraft(section));
    setFieldDialogOpen(true);
  };

  const openEditField = (template: SurveyTemplate, field: SurveyField) => {
    setEditingTemplateId(template.id);
    setFieldMode("edit");
    setEditingOriginalKey(field.key);
    setFieldDraft(draftFromField(field));
    setFieldDialogOpen(true);
  };

  const openCreateSection = (template: SurveyTemplate) => {
    setSectionTemplateId(template.id);
    setRenamingSection(null);
    setSectionName("");
    setSectionDialogOpen(true);
  };

  const openRenameSection = (template: SurveyTemplate, section: string) => {
    setSectionTemplateId(template.id);
    setRenamingSection(section);
    setSectionName(section);
    setSectionDialogOpen(true);
  };

  const onSaveField = async () => {
    const template = items.find((t) => t.id === editingTemplateId);
    if (!template) return;
    const label = fieldDraft.label.trim();
    let key = fieldDraft.key.trim();
    if (!label) {
      setError("请填写字段名称");
      return;
    }
    if (!key) key = slugifyKey(label);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      setError("字段 key 仅允许字母、数字、下划线，且不能以数字开头");
      return;
    }
    const section = fieldDraft.section.trim() || "未分组";
    const target = resolveTarget(fieldDraft);
    if (fieldDraft.target === "hospital.archive." && !fieldDraft.customArchiveKey.trim()) {
      setError("请填写 archive 字段后缀，例如 region");
      return;
    }

    const schema = normalizeSchema(template.schema);
    const nextField: SurveyField = {
      key,
      label,
      section,
      required: fieldDraft.required,
      type: fieldDraft.type || "text",
      ...(target ? { target } : {}),
      ...(fieldDraft.defaultValue.trim()
        ? { default: fieldDraft.defaultValue.trim() }
        : {}),
      ...(fieldDraft.locked ? { locked: true } : {}),
    };

    const fields = [...(schema.fields || [])];
    if (fieldMode === "edit" && editingOriginalKey) {
      const idx = fields.findIndex((f) => f.key === editingOriginalKey);
      if (idx < 0) {
        setError("原字段不存在");
        return;
      }
      if (key !== editingOriginalKey && fields.some((f) => f.key === key)) {
        setError("字段 key 已存在");
        return;
      }
      fields[idx] = nextField;
    } else {
      if (fields.some((f) => f.key === key)) {
        setError("字段 key 已存在");
        return;
      }
      fields.push(nextField);
    }

    const sections = schema.sections || [];
    if (!sections.includes(section)) sections.push(section);

    const ok = await persistSchema(template, { fields, sections });
    if (ok) setFieldDialogOpen(false);
  };

  const onDeleteField = async () => {
    if (fieldMode !== "edit" || !editingOriginalKey) return;
    const template = items.find((t) => t.id === editingTemplateId);
    if (!template) return;
    if (!window.confirm(`确定删除字段「${fieldDraft.label || editingOriginalKey}」？`)) {
      return;
    }
    const schema = normalizeSchema(template.schema);
    const fields = (schema.fields || []).filter((f) => f.key !== editingOriginalKey);
    const ok = await persistSchema(template, { fields, sections: schema.sections });
    if (ok) setFieldDialogOpen(false);
  };

  const onSaveSection = async () => {
    const template = items.find((t) => t.id === sectionTemplateId);
    if (!template) return;
    const name = sectionName.trim();
    if (!name) {
      setError("请填写分组名称");
      return;
    }
    const schema = normalizeSchema(template.schema);
    const sections = [...(schema.sections || [])];
    let fields = [...(schema.fields || [])];

    if (renamingSection) {
      if (name !== renamingSection && sections.includes(name)) {
        setError("分组名称已存在");
        return;
      }
      const idx = sections.indexOf(renamingSection);
      if (idx >= 0) sections[idx] = name;
      fields = fields.map((f) =>
        (f.section || "未分组") === renamingSection ? { ...f, section: name } : f,
      );
    } else {
      if (sections.includes(name)) {
        setError("分组名称已存在");
        return;
      }
      sections.push(name);
    }

    const ok = await persistSchema(template, { fields, sections });
    if (ok) setSectionDialogOpen(false);
  };

  const onDeleteSection = async (template: SurveyTemplate, section: string) => {
    const schema = normalizeSchema(template.schema);
    const count = (schema.fields || []).filter(
      (f) => (f.section || "未分组") === section,
    ).length;
    const msg =
      count > 0
        ? `确定删除分组「${section}」及其 ${count} 个字段？`
        : `确定删除空分组「${section}」？`;
    if (!window.confirm(msg)) return;
    const fields = (schema.fields || []).filter(
      (f) => (f.section || "未分组") !== section,
    );
    const sections = (schema.sections || []).filter((s) => s !== section);
    await persistSchema(template, { fields, sections });
  };

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>模板管理</CardTitle>
                <CardDescription>当前共 {items.length} 个模板</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={load}
                disabled={loading || saving || creating}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading || saving || creating ? "animate-spin" : ""}`}
                />
              </Button>
              <Button onClick={openCreateTemplate} disabled={creating}>
                <Plus className="mr-1 h-4 w-4" />
                新建模板
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>标题</TableHead>
                  <TableHead>编码</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead>字段数</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      暂无模板
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const open = expanded === item.id;
                    const schema = normalizeSchema(item.schema);
                    const groups = groupBySection(schema);
                    return (
                      <Fragment key={item.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() =>
                            setExpanded((prev) => (prev === item.id ? null : item.id))
                          }
                        >
                          <TableCell>
                            {open ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{item.title}</TableCell>
                          <TableCell className="font-mono text-xs">{item.code}</TableCell>
                          <TableCell>v{item.version}</TableCell>
                          <TableCell>{schema.fields.length}</TableCell>
                          <TableCell>{statusBadge(item.status)}</TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30 p-4">
                              {item.description ? (
                                <p className="mb-3 text-sm text-muted-foreground">
                                  {item.description}
                                </p>
                              ) : null}
                              <div className="space-y-4">
                                {groups.map(({ section, fields }) => (
                                  <div key={section}>
                                    <div className="mb-2 flex items-center gap-2">
                                      <button
                                        type="button"
                                        className="text-sm font-medium hover:underline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openRenameSection(item, section);
                                        }}
                                      >
                                        {section}
                                      </button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground"
                                        title="删除分组"
                                        disabled={saving}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onDeleteSection(item, section);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                      {fields.map((f) => (
                                        <button
                                          key={f.key}
                                          type="button"
                                          className="rounded-md border bg-background px-3 py-2 text-left text-sm transition hover:border-primary/40 hover:bg-accent/40"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openEditField(item, f);
                                          }}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="font-medium">{f.label}</span>
                                              <div className="flex items-center gap-1">
                                                {f.locked ? (
                                                  <Badge variant="secondary">锁定</Badge>
                                                ) : null}
                                                {f.required ? (
                                                  <Badge variant="outline">必填</Badge>
                                                ) : null}
                                              </div>
                                            </div>
                                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                              {f.key}
                                              {f.target ? ` → ${f.target}` : ""}
                                            </p>
                                            {f.default ? (
                                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                默认：{f.default}
                                              </p>
                                            ) : null}
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        className="flex min-h-[64px] items-center justify-center rounded-md border border-dashed bg-background/60 text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                                        disabled={saving}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openCreateField(item, section);
                                        }}
                                        title="新建字段"
                                      >
                                        <Plus className="h-5 w-5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <div>
                                  <p className="mb-2 text-sm font-medium text-muted-foreground">
                                    新建分组
                                  </p>
                                  <button
                                    type="button"
                                    className="flex min-h-[72px] w-full items-center justify-center rounded-md border border-dashed bg-background/60 text-muted-foreground transition hover:border-primary/50 hover:text-foreground sm:max-w-xs"
                                    disabled={saving}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openCreateSection(item);
                                    }}
                                    title="新建分组"
                                  >
                                    <Plus className="h-5 w-5" />
                                  </button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>新建模板</DialogTitle>
            <DialogDescription>
              创建后可展开模板，用加号添加分组与字段。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input
                value={createDraft.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setCreateDraft((d) => ({
                    ...d,
                    title,
                    code: d.code || slugifyKey(title),
                  }));
                }}
                placeholder="例如：化免客户档案采集"
              />
            </div>
            <div className="space-y-2">
              <Label>编码</Label>
              <Input
                value={createDraft.code}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, code: e.target.value.trim() }))
                }
                placeholder="例如：immuno_archive_v2"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                仅字母、数字、下划线与短横线，全局唯一。
              </p>
            </div>
            <div className="space-y-2">
              <Label>说明（可选）</Label>
              <Input
                value={createDraft.description}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, description: e.target.value }))
                }
                placeholder="模板用途简述"
              />
            </div>
          </div>
          <DialogFooter className="border-t px-5 py-3">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              取消
            </Button>
            <Button onClick={onCreateTemplate} disabled={creating}>
              {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{fieldMode === "edit" ? "编辑字段" : "新建字段"}</DialogTitle>
            <DialogDescription>
              配置采集字段及其写入医院主数据 / archive 的映射。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>显示名称</Label>
                <Input
                  value={fieldDraft.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    setFieldDraft((d) => ({
                      ...d,
                      label,
                      key:
                        fieldMode === "create" && !d.key
                          ? slugifyKey(label)
                          : d.key,
                    }));
                  }}
                  placeholder="例如：医院名称"
                />
              </div>
              <div className="space-y-2">
                <Label>字段 key</Label>
                <Input
                  value={fieldDraft.key}
                  onChange={(e) =>
                    setFieldDraft((d) => ({ ...d, key: e.target.value.trim() }))
                  }
                  placeholder="例如：name"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>所属分组</Label>
                <Select
                  value={fieldDraft.section}
                  onValueChange={(v) => setFieldDraft((d) => ({ ...d, section: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择分组" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>类型</Label>
                <Select
                  value={fieldDraft.type}
                  onValueChange={(v) => setFieldDraft((d) => ({ ...d, type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">文本</SelectItem>
                    <SelectItem value="number">数字</SelectItem>
                    <SelectItem value="date">日期</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>映射目标</Label>
              <Select
                value={fieldDraft.target || "__none__"}
                onValueChange={(v) =>
                  setFieldDraft((d) => ({
                    ...d,
                    target: v === "__none__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_PRESETS.map((p) => (
                    <SelectItem key={p.value || "__none__"} value={p.value || "__none__"}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldDraft.target === "hospital.archive." ? (
                <Input
                  className="mt-2 font-mono"
                  value={fieldDraft.customArchiveKey}
                  onChange={(e) =>
                    setFieldDraft((d) => ({
                      ...d,
                      customArchiveKey: e.target.value.trim(),
                    }))
                  }
                  placeholder="archive 键名，如 region"
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>默认值（可选）</Label>
              <Input
                value={fieldDraft.defaultValue}
                onChange={(e) =>
                  setFieldDraft((d) => ({ ...d, defaultValue: e.target.value }))
                }
                placeholder="采集员打开表单时的预填值"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fieldDraft.required}
                  onChange={(e) =>
                    setFieldDraft((d) => ({ ...d, required: e.target.checked }))
                  }
                />
                必填
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fieldDraft.locked}
                  onChange={(e) =>
                    setFieldDraft((d) => ({ ...d, locked: e.target.checked }))
                  }
                />
                锁定（采集员不可改）
              </label>
            </div>
          </div>
          <DialogFooter className="border-t px-5 py-3">
            {fieldMode === "edit" ? (
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={onDeleteField}
              >
                删除
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-1 justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFieldDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="button" disabled={saving} onClick={onSaveField}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                保存
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{renamingSection ? "重命名分组" : "新建分组"}</DialogTitle>
            <DialogDescription>分组用于在采集表单中归类字段。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-5 py-4">
            <Label>分组名称</Label>
            <Input
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="例如：设备信息"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSaveSection();
                }
              }}
            />
          </div>
          <DialogFooter className="border-t px-5 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSectionDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={saving} onClick={onSaveSection}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
