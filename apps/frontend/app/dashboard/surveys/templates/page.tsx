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
import {
  ARCHIVE_FIELD_DEFS,
  HOSPITAL_COLUMNS,
  listHospitalAttributeOptions,
} from "@/lib/hospital-archive";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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

/** 关联实体：必须映射医院写回或检测项目字典 */
type MapEntity = "hospital" | "assay";

const ASSAY_WRITE_OPTIONS = [
  {
    value: "mindrayProjects",
    label: "迈瑞开展项目",
    target: "hospital.archive.mindrayProjects",
  },
  {
    value: "newProjects",
    label: "主导新增项目",
    target: "hospital.archive.newProjects",
  },
] as const;

const NEW_ARCHIVE_ATTR = "__new_archive__";

type FieldDraft = {
  key: string;
  label: string;
  section: string;
  required: boolean;
  type: string;
  mapEntity: MapEntity;
  /** 实体属性：列名 / archive.xxx / __new_archive__ */
  attribute: string;
  newArchiveKey: string;
  defaultValue: string;
  locked: boolean;
};

const emptyFieldDraft = (section: string): FieldDraft => ({
  key: "",
  label: "",
  section,
  required: false,
  type: "text",
  mapEntity: "hospital",
  attribute: "name",
  newArchiveKey: "",
  defaultValue: "",
  locked: false,
});

function collectArchiveKeysFromTemplates(templates: SurveyTemplate[]): string[] {
  const keys: string[] = [];
  for (const t of templates) {
    for (const f of t.schema?.fields || []) {
      const target = f.target || "";
      if (target.startsWith("hospital.archive.")) {
        const k = target.slice("hospital.archive.".length).trim();
        if (k) keys.push(k);
      }
    }
  }
  return keys;
}

function fieldTypeFromArchive(
  valueType: (typeof ARCHIVE_FIELD_DEFS)[number]["valueType"],
): string {
  if (valueType === "number") return "number";
  if (valueType === "string_array") return "string_array";
  if (valueType === "competitor_list") return "competitor_list";
  return "text";
}

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
  const target = (field.target || "").trim();
  const base = emptyFieldDraft(field.section || "未分组");
  base.key = field.key;
  base.label = field.label;
  base.required = !!field.required;
  base.type = field.type || "text";
  base.defaultValue = field.default || "";
  base.locked = !!field.locked;

  const assayOpt = ASSAY_WRITE_OPTIONS.find((o) => o.target === target);
  if (
    field.optionsSource === "assay_projects" ||
    assayOpt ||
    field.key === "mindrayProjects" ||
    field.key === "newProjects"
  ) {
    base.mapEntity = "assay";
    base.type = "string_array";
    base.attribute = assayOpt?.value || field.key || "mindrayProjects";
    return base;
  }

  if (!target) {
    // 历史未映射字段：打开编辑时强制改为医院.name，保存前必须选好映射
    base.mapEntity = "hospital";
    base.attribute = "name";
    return base;
  }
  if (target.startsWith("hospital.archive.")) {
    const key = target.slice("hospital.archive.".length).trim();
    base.mapEntity = "hospital";
    base.attribute = key ? `archive.${key}` : "name";
    return base;
  }
  if (target.startsWith("hospital.attributes.")) {
    base.mapEntity = "hospital";
    base.attribute = `attributes.${target.slice("hospital.attributes.".length)}`;
    return base;
  }
  if (target.startsWith("hospital.metrics.")) {
    base.mapEntity = "hospital";
    base.attribute = `metrics.${target.slice("hospital.metrics.".length)}`;
    return base;
  }
  const col = HOSPITAL_COLUMNS.find((c) => c.target === target);
  if (col) {
    base.mapEntity = "hospital";
    base.attribute = col.column;
    return base;
  }
  if (/^hospital\.[a-zA-Z_]+$/.test(target)) {
    base.mapEntity = "hospital";
    base.attribute = target.slice("hospital.".length);
    return base;
  }
  base.mapEntity = "hospital";
  base.attribute = "name";
  return base;
}

function resolveTarget(draft: FieldDraft): string | undefined {
  if (draft.mapEntity === "assay") {
    const opt = ASSAY_WRITE_OPTIONS.find((o) => o.value === draft.attribute);
    return opt?.target || ASSAY_WRITE_OPTIONS[0].target;
  }
  if (draft.mapEntity === "hospital") {
    if (draft.attribute === NEW_ARCHIVE_ATTR) {
      const key = draft.newArchiveKey.trim();
      return key ? `hospital.archive.${key}` : undefined;
    }
    if (draft.attribute.startsWith("archive.")) {
      const key = draft.attribute.slice("archive.".length).trim();
      return key ? `hospital.archive.${key}` : undefined;
    }
    if (draft.attribute.startsWith("attributes.")) {
      const key = draft.attribute.slice("attributes.".length).trim();
      return key ? `hospital.attributes.${key}` : undefined;
    }
    if (draft.attribute.startsWith("metrics.")) {
      const key = draft.attribute.slice("metrics.".length).trim();
      return key ? `hospital.metrics.${key}` : undefined;
    }
    const col = HOSPITAL_COLUMNS.find((c) => c.column === draft.attribute);
    if (col) return col.target;
    if (draft.attribute) return `hospital.${draft.attribute}`;
  }
  return undefined;
}

function applyHospitalAttribute(
  draft: FieldDraft,
  attribute: string,
  mode: "create" | "edit",
): FieldDraft {
  const next: FieldDraft = {
    ...draft,
    mapEntity: "hospital",
    attribute,
    newArchiveKey: attribute === NEW_ARCHIVE_ATTR ? draft.newArchiveKey : "",
  };
  if (mode === "create" && attribute.startsWith("archive.")) {
    const archiveKey = attribute.slice("archive.".length);
    const def = ARCHIVE_FIELD_DEFS.find((d) => d.key === archiveKey);
    if (def) {
      if (!next.key) next.key = def.key;
      if (!next.label) next.label = def.label;
      next.type = fieldTypeFromArchive(def.valueType);
      if (!next.section || next.section === "未分组") next.section = def.section;
    } else if (!next.key) {
      next.key = archiveKey;
    }
  }
  if (mode === "create" && attribute !== NEW_ARCHIVE_ATTR && !attribute.startsWith("archive.")) {
    if (!next.key) next.key = attribute;
  }
  return next;
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
    const base = editingTemplate
      ? normalizeSchema(editingTemplate.schema).sections || []
      : [];
    if (fieldDraft.section && !base.includes(fieldDraft.section)) {
      return [...base, fieldDraft.section];
    }
    return base;
  }, [editingTemplate, fieldDraft.section]);

  const hospitalAttrOptions = useMemo(() => {
    return listHospitalAttributeOptions(collectArchiveKeysFromTemplates(items));
  }, [items]);

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
    if (fieldDraft.attribute === NEW_ARCHIVE_ATTR) {
      setError("不允许新建系统外字段，请从已有数据库字段中选择");
      return;
    }
    if (fieldDraft.mapEntity === "hospital" && !fieldDraft.attribute) {
      setError("请选择要绑定的数据库字段");
      return;
    }
    if (fieldDraft.mapEntity === "assay" && !fieldDraft.attribute) {
      setError("请选择写入的项目字段");
      return;
    }
    const target = resolveTarget(fieldDraft);
    if (!target) {
      setError("每个采集字段必须绑定到系统已有的数据库字段");
      return;
    }

    const schema = normalizeSchema(template.schema);
    const fieldType =
      fieldDraft.mapEntity === "assay"
        ? "string_array"
        : fieldDraft.type || "text";
    const nextField: SurveyField = {
      key,
      label,
      section,
      required: fieldDraft.required,
      type: fieldType,
      target,
      ...(fieldDraft.mapEntity === "assay"
        ? { optionsSource: "assay_projects" as const }
        : {}),
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

  const renderTemplateEditor = (item: SurveyTemplate) => {
    const schema = normalizeSchema(item.schema);
    const groups = groupBySection(schema);
    return (
      <>
        {item.description ? (
          <p className="mb-3 text-sm text-muted-foreground">{item.description}</p>
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
                        {f.locked ? <Badge variant="secondary">锁定</Badge> : null}
                        {f.required ? <Badge variant="outline">必填</Badge> : null}
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
            <p className="mb-2 text-sm font-medium text-muted-foreground">新建分组</p>
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
      </>
    );
  };

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
            <PageToolbar>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={load}
                disabled={loading || saving || creating}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading || saving || creating ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                className="min-h-10 w-full sm:w-auto"
                onClick={openCreateTemplate}
                disabled={creating}
              >
                <Plus className="mr-1 h-4 w-4" />
                新建模板
              </Button>
            </PageToolbar>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DesktopTable>
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
                              {renderTemplateEditor(item)}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
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
                暂无模板
              </li>
            ) : (
              items.map((item) => {
                const open = expanded === item.id;
                const schema = normalizeSchema(item.schema);
                return (
                  <MobileCardItem key={item.id}>
                    <button
                      type="button"
                      className="flex w-full min-h-10 flex-col gap-2 text-left"
                      onClick={() =>
                        setExpanded((prev) => (prev === item.id ? null : item.id))
                      }
                    >
                      <div className="flex items-start gap-2">
                        {open ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{item.title}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {item.code} · v{item.version} · {schema.fields.length} 字段
                          </div>
                        </div>
                        {statusBadge(item.status)}
                      </div>
                    </button>
                    {open ? (
                      <div className="rounded-md bg-muted/30 p-3">
                        {renderTemplateEditor(item)}
                      </div>
                    ) : null}
                  </MobileCardItem>
                );
              })
            )}
          </MobileCardList>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>新建模板</DialogTitle>
            <DialogDescription className="sr-only">新建问卷模板</DialogDescription>
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
            <DialogDescription className="sr-only">
              配置问卷字段
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
                  value={
                    fieldDraft.mapEntity === "assay"
                      ? "string_array"
                      : fieldDraft.type
                  }
                  onValueChange={(v) =>
                    setFieldDraft((d) => ({ ...d, type: v }))
                  }
                  disabled={fieldDraft.mapEntity === "assay"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">文本</SelectItem>
                    <SelectItem value="number">数字</SelectItem>
                    <SelectItem value="date">日期</SelectItem>
                    <SelectItem value="boolean">是/否</SelectItem>
                    <SelectItem value="enum">单选</SelectItem>
                    <SelectItem value="string_array">多选数组</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>绑定数据库字段</Label>
              <Select
                value={fieldDraft.mapEntity}
                onValueChange={(v) =>
                  setFieldDraft((d) => {
                    const entity = v as MapEntity;
                    if (entity === "assay") {
                      return {
                        ...d,
                        mapEntity: "assay",
                        type: "string_array",
                        attribute:
                          d.attribute === "newProjects"
                            ? "newProjects"
                            : "mindrayProjects",
                        newArchiveKey: "",
                      };
                    }
                    return {
                      ...d,
                      mapEntity: "hospital",
                      attribute: d.attribute && d.attribute !== NEW_ARCHIVE_ATTR
                        ? d.attribute
                        : "name",
                      newArchiveKey: "",
                    };
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hospital">医院（必选映射）</SelectItem>
                  <SelectItem value="assay">检测项目</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                模板字段必须绑定系统已有数据库字段，不允许不映射或新建系统外字段。
              </p>
            </div>
            {fieldDraft.mapEntity === "assay" ? (
              <div className="space-y-2">
                <Label>写入位置</Label>
                <Select
                  value={fieldDraft.attribute || "mindrayProjects"}
                  onValueChange={(v) =>
                    setFieldDraft((d) => ({
                      ...d,
                      mapEntity: "assay",
                      type: "string_array",
                      attribute: v,
                      key:
                        fieldMode === "create" && (!d.key || d.key === "mindrayProjects" || d.key === "newProjects")
                          ? v
                          : d.key,
                      label:
                        fieldMode === "create" && (!d.label || d.label === "迈瑞开展项目" || d.label === "主导新增项目")
                          ? ASSAY_WRITE_OPTIONS.find((o) => o.value === v)?.label || d.label
                          : d.label,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSAY_WRITE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {fieldDraft.mapEntity === "hospital" ? (
              <div className="space-y-2">
                <Label>实体属性</Label>
                <Select
                  value={fieldDraft.attribute || undefined}
                  onValueChange={(v) =>
                    setFieldDraft((d) => applyHospitalAttribute(d, v, fieldMode))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择字段" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectGroup>
                      <SelectLabel>表列</SelectLabel>
                      {hospitalAttrOptions
                        .filter(
                          (o) =>
                            o.value !== NEW_ARCHIVE_ATTR &&
                            !o.value.startsWith("archive.") &&
                            !o.value.startsWith("attributes.") &&
                            !o.value.startsWith("metrics."),
                        )
                        .map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.value}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>属性</SelectLabel>
                      {hospitalAttrOptions
                        .filter((o) => o.value.startsWith("attributes."))
                        .map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.value}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>指标</SelectLabel>
                      {hospitalAttrOptions
                        .filter((o) => o.value.startsWith("metrics."))
                        .map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.value}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>档案扩展</SelectLabel>
                      {hospitalAttrOptions
                        .filter((o) => o.value.startsWith("archive."))
                        .map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.value.replace(/^archive\./, "")}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                    {fieldDraft.attribute &&
                    fieldDraft.attribute !== NEW_ARCHIVE_ATTR &&
                    !hospitalAttrOptions.some(
                      (o) => o.value === fieldDraft.attribute,
                    ) ? (
                      <SelectGroup>
                        <SelectLabel>当前</SelectLabel>
                        <SelectItem value={fieldDraft.attribute}>
                          {fieldDraft.attribute}
                        </SelectItem>
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
                {resolveTarget(fieldDraft) ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    → {resolveTarget(fieldDraft)}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>默认值（可选）</Label>
              <Input
                value={fieldDraft.defaultValue}
                onChange={(e) =>
                  setFieldDraft((d) => ({ ...d, defaultValue: e.target.value }))
                }
                placeholder="可选"
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
            <DialogDescription className="sr-only">编辑分组名称</DialogDescription>
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
