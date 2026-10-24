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
  listCollectableFields,
  type CollectableField,
  type SurveyField,
  type SurveySchema,
  type SurveyTemplate,
} from "@/lib/business";
import {
  ARCHIVE_FIELD_DEFS,
  HOSPITAL_COLUMNS,
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

/** 关联实体：必须映射可采集字段目录中的条目 */
type MapEntity = "hospital" | "assay" | "eqa";

type FieldDraft = {
  key: string;
  label: string;
  section: string;
  required: boolean;
  type: string;
  mapEntity: MapEntity;
  /** catalog storageTarget, or legacy attribute selector value */
  attribute: string;
  /** explicit catalog storage target when bound from API */
  catalogTarget: string;
  defaultValue: string;
  locked: boolean;
  options: string[];
  optionsSource?: SurveyField["optionsSource"];
};

const emptyFieldDraft = (section: string): FieldDraft => ({
  key: "",
  label: "",
  section,
  required: false,
  type: "text",
  mapEntity: "hospital",
  attribute: "hospital.name",
  catalogTarget: "hospital.name",
  defaultValue: "",
  locked: false,
  options: [],
  optionsSource: "hospitals",
});

function fieldTypeFromArchive(
  valueType: (typeof ARCHIVE_FIELD_DEFS)[number]["valueType"],
): string {
  if (valueType === "number") return "number";
  if (valueType === "string_array") return "string_array";
  if (valueType === "competitor_list") return "competitor_list";
  return "text";
}

/** 数值类医院指标（其余 metrics 按文本） */
const NUMERIC_METRIC_CODES = new Set([
  "sample_volume_own",
  "sample_volume_total",
  "hospital_annual_revenue",
  "iot_stock",
  "iot_forecast",
  "iot_increment",
  "iot_growth_rate",
  "reagent_revenue",
  "reagent_revenue_target",
]);

const DATE_ARCHIVE_KEYS = new Set(["installedAt", "enabledAt"]);
/**
 * 字段类型一律由目录 / 映射决定，模板编辑器不可手改。
 */
function resolveFieldTypeFromMapping(draft: FieldDraft): string {
  if (draft.type) return draft.type;
  if (draft.mapEntity === "assay") return "assay_block";
  if (draft.mapEntity === "eqa") return "boolean";
  const attr = (draft.attribute || "").trim();
  if (attr.startsWith("hospital.attributes.customer_level") || attr.endsWith("customer_level")) {
    return "enum";
  }
  if (attr.startsWith("archive.")) {
    const key = attr.slice("archive.".length).trim();
    if (DATE_ARCHIVE_KEYS.has(key)) return "date";
    const def = ARCHIVE_FIELD_DEFS.find((d) => d.key === key);
    if (def?.valueType) return fieldTypeFromArchive(def.valueType);
    return "text";
  }
  if (attr.startsWith("metrics.") || attr.includes(".metrics.")) {
    const code = attr.includes(".") ? attr.split(".").pop()! : attr;
    return NUMERIC_METRIC_CODES.has(code) ? "number" : "text";
  }
  if (attr === "level" || attr === "type" || attr === "status" || attr.endsWith(".level") || attr.endsWith(".type") || attr.endsWith(".status")) {
    return "enum";
  }
  return "text";
}

function resolveOptionsSource(
  draft: FieldDraft,
): SurveyField["optionsSource"] | undefined {
  if (draft.optionsSource) return draft.optionsSource;
  const t = (draft.catalogTarget || draft.attribute || "").trim();
  if (t === "hospital.name" || (t.endsWith(".name") && t.includes("hospital"))) return "hospitals";
  return undefined;
}


function resolveEnumOptions(
  options: string[] | undefined,
  target: string | undefined,
  catalogByTarget: Map<string, CollectableField>,
): string[] {
  if (options?.length) return options.map(String);
  const t = (target || "").trim();
  if (!t) return [];
  const cat = catalogByTarget.get(t);
  if (cat?.enumValues?.length) return cat.enumValues.map(String);
  return [];
}

function formatEnumOptions(values: string[]): string {
  return values.join(" / ");
}
function typeLabel(type: string): string {
  switch (type) {
    case "text":
      return "文本";
    case "number":
      return "数字";
    case "date":
      return "日期";
    case "boolean":
      return "是/否";
    case "enum":
      return "单选";
    case "string_array":
      return "多选数组";
    case "competitor_list":
      return "竞品列表";
    case "multi_enum":
    case "multi_select":
      return "多选";
    case "eqa_block":
      return "EQA 复合块";
    case "assay_block":
      return "检测项目树";
    default:
      return type || "文本";
  }
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

/** Answer-bag key: derived from catalog code/target; admins never type this. */
function deriveFieldKeyFromCatalog(field: {
  code: string;
  storageTarget: string;
}): string {
  const strip = (raw: string) =>
    raw
      .replace(/^hospital\.(attributes|metrics|archive)\./, "")
      .replace(/^hospital\./, "")
      .replace(/^eqa\.field\./, "")
      .replace(/^eqa\./, "")
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
  for (const src of [field.code, field.storageTarget]) {
    const key = strip(src || "");
    if (key && /^[a-zA-Z_]/.test(key)) return key;
  }
  return `field_${Date.now().toString(36)}`;
}

function ensureUniqueFieldKey(
  base: string,
  existingKeys: string[],
  excludeKey?: string | null,
): string {
  const taken = new Set(existingKeys.filter((k) => k !== excludeKey));
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}_${n++}`;
  }
  return candidate;
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
  base.defaultValue = field.default || "";
  base.locked = !!field.locked;
  base.type = field.type || "text";
  base.options = field.options || [];
  base.optionsSource = field.optionsSource;
  base.catalogTarget = target;
  base.attribute = target || "hospital.name";

  if (target.startsWith("eqa.")) {
    base.mapEntity = "eqa";
    return base;
  }
  if (
    field.type === "assay_block" ||
    target === "assay.block" ||
    target.startsWith("assay.")
  ) {
    base.mapEntity = "assay";
    base.attribute = target || "assay.block";
    base.catalogTarget = base.attribute;
    base.type = "assay_block";
    base.optionsSource = undefined;
    return base;
  }
  base.mapEntity = "hospital";
  if (!target) {
    base.attribute = "hospital.name";
    base.catalogTarget = "hospital.name";
    base.type = "text";
    base.optionsSource = "hospitals";
  }
  return base;
}

function resolveTarget(draft: FieldDraft): string | undefined {
  const catalog = (draft.catalogTarget || "").trim();
  if (catalog) return catalog;
  if (draft.mapEntity === "assay") {
    return (draft.catalogTarget || draft.attribute || "assay.block").trim() || "assay.block";
  }
  const attr = (draft.attribute || "").trim();
  if (!attr) return undefined;
  if (attr.startsWith("hospital.") || attr.startsWith("eqa.")) return attr;
  if (attr.startsWith("archive.")) return `hospital.${attr}`;
  if (attr.startsWith("attributes.")) return `hospital.${attr}`;
  if (attr.startsWith("metrics.")) return `hospital.${attr}`;
  const col = HOSPITAL_COLUMNS.find((c) => c.column === attr);
  if (col) return col.target;
  return `hospital.${attr}`;
}

function applyCatalogField(
  draft: FieldDraft,
  field: CollectableField,
  mode: "create" | "edit",
): FieldDraft {
  const domain = field.domain as MapEntity;
  const mapEntity: MapEntity =
    domain === "eqa"
      ? "eqa"
      : domain === "assay" || field.valueType === "assay_block"
        ? "assay"
        : "hospital";
  const next: FieldDraft = {
    ...draft,
    mapEntity,
    attribute: field.storageTarget,
    catalogTarget: field.storageTarget,
    type: field.valueType || "text",
    options: field.enumValues || [],
    optionsSource: (field.optionsSource as SurveyField["optionsSource"]) || undefined,
  };
  if (mode === "create") {
    // Always derive from catalog so admins never hand-edit keys
    next.key = deriveFieldKeyFromCatalog(field);
    if (!next.label) next.label = field.label;
    if (!next.section || next.section === "未分组") {
      next.section = field.section || next.section || "未分组";
    }
  }
  // edit mode: keep existing key for answer-bag backward compatibility
  return next;
}

export default function SurveyTemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<SurveyTemplate[]>([]);
  const [catalog, setCatalog] = useState<CollectableField[]>([]);
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
    const [res, cat] = await Promise.all([
      listSurveyTemplates(),
      listCollectableFields(),
    ]);
    if (res.error) setError(res.error);
    else if (cat.error) setError(cat.error);
    setItems(res.items);
    setCatalog(cat.items || []);
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

  const catalogByDomain = useMemo(() => {
    const groups: Record<string, CollectableField[]> = {
      hospital: [],
      assay: [],
      eqa: [],
    };
    for (const f of catalog) {
      const d = f.domain || "hospital";
      if (!groups[d]) groups[d] = [];
      groups[d].push(f);
    }
    return groups;
  }, [catalog]);

  const catalogByTarget = useMemo(() => {
    const m = new Map<string, CollectableField>();
    for (const f of catalog) m.set(f.storageTarget, f);
    return m;
  }, [catalog]);

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
    if (field.type === "eqa_block") {
      if (
        window.confirm(
          `「${field.label || "室间质评"}」是 EQA 复合块（科目来自系统字典）。\n确定删除该块？`,
        )
      ) {
        const schema = normalizeSchema(template.schema);
        const fields = (schema.fields || []).filter((f) => f.key !== field.key);
        void persistSchema(template, { fields, sections: schema.sections });
      }
      return;
    }
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
    if (!label) {
      setError("请填写字段名称");
      return;
    }
    const section = fieldDraft.section.trim() || "未分组";
    const target = resolveTarget(fieldDraft);
    if (!target) {
      setError("请从可采集字段目录中选择绑定字段");
      return;
    }
    if (!catalogByTarget.has(target)) {
      setError(`映射「${target}」不在可采集字段目录中`);
      return;
    }

    const schema = normalizeSchema(template.schema);
    const cat = catalogByTarget.get(target);
    const existingKeys = (schema.fields || []).map((f) => f.key);
    let key: string;
    if (fieldMode === "edit" && editingOriginalKey) {
      // Preserve original key so existing answer bags stay aligned
      key = editingOriginalKey;
    } else {
      const base =
        (fieldDraft.key.trim() &&
        /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(fieldDraft.key.trim())
          ? fieldDraft.key.trim()
          : null) ||
        (cat
          ? deriveFieldKeyFromCatalog(cat)
          : deriveFieldKeyFromCatalog({
              code: target,
              storageTarget: target,
            }));
      key = ensureUniqueFieldKey(base, existingKeys);
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(key)) {
      setError("自动生成的字段 key 无效，请重新选择目录字段");
      return;
    }
    const fieldType = cat?.valueType || resolveFieldTypeFromMapping(fieldDraft);
    const optionsSource =
      (cat?.optionsSource as SurveyField["optionsSource"] | undefined) ||
      resolveOptionsSource(fieldDraft);
    const enumOptions = cat?.enumValues?.length
      ? cat.enumValues
      : fieldDraft.options;
    const nextField: SurveyField = {
      key,
      label,
      section,
      required: fieldDraft.required,
      type: fieldType,
      target,
      ...(optionsSource ? { optionsSource } : {}),
      ...(enumOptions?.length ? { options: enumOptions } : {}),
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
      fields[idx] = nextField;
    } else {
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

  const onInsertEqaBlock = async (template: SurveyTemplate, section?: string) => {
    const schema = normalizeSchema(template.schema);
    if ((schema.fields || []).some((f) => f.type === "eqa_block")) {
      setError("该模板已有 EQA 块，每个模板只需一个");
      return;
    }
    const sec = (section || "室间质评").trim() || "室间质评";
    const key = ensureUniqueFieldKey("eqa", (schema.fields || []).map((f) => f.key));
    const nextField: SurveyField = {
      key,
      label: "室间质评",
      section: sec,
      type: "eqa_block",
      target: "eqa.block",
      enableNational: true,
      enableProvincial: true,
    };
    const fields = [...(schema.fields || []), nextField];
    const sections = [...(schema.sections || [])];
    if (!sections.includes(sec)) sections.push(sec);
    setError(null);
    await persistSchema(template, { fields, sections });
  };

  const onInsertAssayBlock = async (template: SurveyTemplate, section?: string) => {
    const schema = normalizeSchema(template.schema);
    if ((schema.fields || []).some((f) => f.type === "assay_block")) {
      setError("该模板已有检测项目块，每个模板只需一个");
      return;
    }
    const sec = (section || "检测项目").trim() || "检测项目";
    const key = ensureUniqueFieldKey("assays", (schema.fields || []).map((f) => f.key));
    const nextField: SurveyField = {
      key,
      label: "检测项目开展",
      section: sec,
      type: "assay_block",
      target: "assay.block",
    };
    const fields = [...(schema.fields || []), nextField];
    const sections = [...(schema.sections || [])];
    if (!sections.includes(sec)) sections.push(sec);
    setError(null);
    await persistSchema(template, { fields, sections });
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
                    {f.type === "eqa_block" ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        国考/省考可选 → 展开科目复选（字典）
                      </p>
                    ) : f.type === "assay_block" ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        检测线 → 类别 → 叶子项目复选（字典树）
                      </p>
                    ) : f.target ? (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        → {f.target}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {typeLabel(f.type || "text")}
                    </p>
                    {(() => {
                      const enumOpts = resolveEnumOptions(
                        f.options,
                        f.target,
                        catalogByTarget,
                      );
                      if (!enumOpts.length) return null;
                      return (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          可选值：{formatEnumOptions(enumOpts)}
                        </p>
                      );
                    })()}
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
          <div className="flex flex-wrap gap-3">
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">新建分组</p>
              <button
                type="button"
                className="flex min-h-[72px] w-full items-center justify-center rounded-md border border-dashed bg-background/60 text-muted-foreground transition hover:border-primary/50 hover:text-foreground sm:min-w-[160px]"
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
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">特殊块</p>
              {error ? (
                <p className="mb-2 text-sm text-destructive">{error}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const fields = normalizeSchema(item.schema).fields || [];
                  const hasEqa = fields.some((f) => f.type === "eqa_block");
                  const hasAssay = fields.some((f) => f.type === "assay_block");
                  return (
                    <>
                      <button
                        type="button"
                        className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-background/60 px-4 text-sm transition sm:min-w-[140px] ${
                          hasEqa
                            ? "cursor-not-allowed text-muted-foreground/70 opacity-70"
                            : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        }`}
                        disabled={saving}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onInsertEqaBlock(item);
                        }}
                        title={
                          hasEqa
                            ? "该模板已有 EQA 块，每个模板只需一个"
                            : "插入 EQA 复合块"
                        }
                      >
                        <Plus className="h-5 w-5" />
                        <span>{hasEqa ? "已有 EQA" : "插入 EQA"}</span>
                      </button>
                      <button
                        type="button"
                        className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-background/60 px-4 text-sm transition sm:min-w-[140px] ${
                          hasAssay
                            ? "cursor-not-allowed text-muted-foreground/70 opacity-70"
                            : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        }`}
                        disabled={saving}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onInsertAssayBlock(item);
                        }}
                        title={
                          hasAssay
                            ? "该模板已有检测项目块，每个模板只需一个"
                            : "插入检测项目树"
                        }
                      >
                        <Plus className="h-5 w-5" />
                        <span>{hasAssay ? "已有检测项目" : "插入检测项目"}</span>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
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
            <div className="space-y-2">
              <Label>显示名称</Label>
              <Input
                value={fieldDraft.label}
                onChange={(e) =>
                  setFieldDraft((d) => ({ ...d, label: e.target.value }))
                }
                placeholder="例如：医院名称"
              />
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
                  value={resolveFieldTypeFromMapping(fieldDraft)}
                  disabled
                >
                  <SelectTrigger className="opacity-80">
                    <SelectValue>
                      {typeLabel(resolveFieldTypeFromMapping(fieldDraft))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">文本</SelectItem>
                    <SelectItem value="number">数字</SelectItem>
                    <SelectItem value="date">日期</SelectItem>
                    <SelectItem value="boolean">是/否</SelectItem>
                    <SelectItem value="enum">单选</SelectItem>
                    <SelectItem value="string_array">多选数组</SelectItem>
                    <SelectItem value="competitor_list">竞品列表</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  类型由绑定的数据库字段决定，不可修改。
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>绑定可采集字段（目录）</Label>
              <Select
                value={fieldDraft.mapEntity}
                onValueChange={(v) => {
                  const entity = v as MapEntity;
                  const first =
                    (entity === "assay"
                      ? (catalogByDomain.assay || []).find((f) => f.valueType === "assay_block") ||
                        ({
                          code: "assay.block",
                          domain: "assay",
                          storageTarget: "assay.block",
                          valueType: "assay_block",
                          label: "检测项目开展",
                          section: "检测项目",
                          enumValues: [],
                        } as CollectableField)
                      : (catalogByDomain[entity] || [])[0]) ||
                    catalogByDomain.hospital?.[0];
                  setFieldDraft((d) =>
                    first
                      ? applyCatalogField(d, first, fieldMode)
                      : { ...d, mapEntity: entity },
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hospital">医院</SelectItem>
                  <SelectItem value="assay">检测项目</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                只能从系统字段目录勾选；类型与映射只读。没有的字段请先在目录/主数据中登记。
              </p>
            </div>
            <div className="space-y-2">
              <Label>目录字段</Label>
              <Select
                value={fieldDraft.catalogTarget || fieldDraft.attribute || undefined}
                onValueChange={(v) => {
                  const field = catalogByTarget.get(v);
                  if (!field) return;
                  setFieldDraft((d) => applyCatalogField(d, field, fieldMode));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择目录字段" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {(fieldDraft.mapEntity === "assay"
                    ? (catalogByDomain.assay || []).filter(
                        (f) => f.valueType === "assay_block",
                      )
                    : (catalogByDomain[fieldDraft.mapEntity] || []).filter(
                        (f) =>
                          f.domain !== "eqa" &&
                          f.domain !== "assay" &&
                          f.valueType !== "eqa_block" &&
                          f.valueType !== "assay_block" &&
                          !f.storageTarget.startsWith("eqa.") &&
                          !f.storageTarget.startsWith("assay.") &&
                          !f.storageTarget.includes("mindrayProjects") &&
                          !f.storageTarget.includes("newProjects"),
                      )
                  ).map((f) => (
                    <SelectItem key={f.code} value={f.storageTarget}>
                      {f.section ? `${f.section} / ` : ""}
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {resolveTarget(fieldDraft) ? (
                <p className="font-mono text-xs text-muted-foreground">
                  → {resolveTarget(fieldDraft)}
                </p>
              ) : null}
              {(() => {
                const enumOpts = resolveEnumOptions(
                  fieldDraft.options,
                  resolveTarget(fieldDraft) || fieldDraft.catalogTarget || fieldDraft.attribute,
                  catalogByTarget,
                );
                if (!enumOpts.length) return null;
                return (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">可选值（系统预置，不可修改）</div>
                    <div className="mt-1 leading-relaxed">
                      {formatEnumOptions(enumOpts)}
                    </div>
                  </div>
                );
              })()}
            </div>
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
