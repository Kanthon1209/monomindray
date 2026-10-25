"use client";

import { useCallback, useEffect, useMemo, useState, Fragment, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
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
  deleteSurveyTemplate,
  listCollectableFields,
  type CollectableField,
  type SurveyField,
  type SurveySchema,
  type SurveyTemplate,
} from "@/lib/business";
import {
  ARCHIVE_FIELD_DEFS,
  DEVICE_SERVICE_EVALUATION_OPTIONS,
  DEVICE_USAGE_LOCATION_OPTIONS,
  HOSPITAL_COLUMNS,
} from "@/lib/hospital-archive";
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
import { AssayTreeField } from "@/components/assay-tree-field";
import {
  DeviceBlockField,
  normalizeDeviceSubFieldOrder,
  normalizeDeviceSubFieldRequired,
  type DeviceSubFieldKey,
} from "@/components/device-block-field";
import { EqaParticipationField } from "@/components/eqa-participation-field";
import { fetchEqaFields, type EqaFieldNode } from "@/lib/eqa";

/** 关联实体：必须映射可采集字段目录中的条目 */
type MapEntity = "hospital" | "assay" | "eqa" | "device";

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
  if (draft.mapEntity === "device") return "device_block";
  if (draft.mapEntity === "eqa") return "boolean";
  const attr = (draft.attribute || "").trim();
  if (attr.startsWith("hospital.attributes.customer_level") || attr.endsWith("customer_level")) {
    return "enum";
  }
  if (attr.startsWith("hospital.attributes.customer_stage") || attr.endsWith("customer_stage")) {
    return "enum";
  }
  // usage_location is a device attr (device_block), not hospital.attributes
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
    case "device_block":
      return "设备列表块";
    default:
      return type || "文本";
  }
}

/** 客户（医院）身份字段：设备/检测项目/EQA 写回都依赖 hospital 实体 */
function isHospitalIdentityField(field: {
  key?: string;
  label?: string;
  type?: string;
  target?: string;
  optionsSource?: SurveyField["optionsSource"];
}): boolean {
  const typ = (field.type || "").toLowerCase();
  if (
    typ === "eqa_block" ||
    typ === "assay_block" ||
    typ === "device_block" ||
    typ === "repeat"
  ) {
    return false;
  }
  if (field.optionsSource === "hospitals") return true;
  const t = (field.target || "").trim();
  if (t === "hospital.name" || t === "hospital.archive.customerName") return true;
  const key = (field.key || "").toLowerCase();
  if (key === "name" || key === "hospitalname" || key === "customername") return true;
  const label = field.label || "";
  return label.includes("客户名称") || label.includes("医院名称");
}

function schemaHasHospitalIdentity(fields: SurveyField[] | undefined): boolean {
  return (fields || []).some(isHospitalIdentityField);
}

function schemaHasCustomerDependentBlocks(
  fields: SurveyField[] | undefined,
): boolean {
  return (fields || []).some((f) => {
    const t = (f.type || "").toLowerCase();
    return t === "eqa_block" || t === "assay_block" || t === "device_block";
  });
}

const CUSTOMER_BLOCK_PREREQ_MSG =
  "设备列表 / 室间质评都属于客户（医院）属性。请先添加「医院名称」字段（绑定 hospital.name）标识客户，再插入这些特殊块。检测覆盖由设备列表推导，勿再单独插入检测项目块。";


const DEFAULT_DEVICE_BLOCK_COLLECT_FIELDS: {
  label: string;
  key: string;
  type: string;
  hint?: string;
}[] = [
  {
    label: "所属公司",
    key: "devices[].brand",
    type: "text",
    hint: "可联想或自定义（迈瑞 / 竞品）；每台设备一组",
  },
  {
    label: "机型",
    key: "devices[].model",
    type: "text",
    hint: "必填，如 BS-2000M / CL-8000",
  },
  {
    label: "序列号",
    key: "devices[].serialNo",
    type: "text",
    hint: "设备序列号",
  },
  {
    label: "安装日期",
    key: "devices[].installedAt",
    type: "date",
    hint: "日历选择",
  },
  {
    label: "到期时间",
    key: "devices[].enabledAt",
    type: "date",
    hint: "日历选择",
  },
  {
    label: "使用位置",
    key: "devices[].usageLocation",
    type: "enum",
    hint: `${DEVICE_USAGE_LOCATION_OPTIONS.join(" / ")}（选「其他」可自填）`,
  },
  {
    label: "所属检测线",
    key: "devices[].assayLineCode",
    type: "enum",
    hint: "生化 / 免疫 / 凝血 / 血球等（assay_projects 字典）",
  },
  {
    label: "检测细项覆盖",
    key: "devices[].itemCodes",
    type: "multi_select",
    hint: "选检测线后按 类别→叶子细项 复选；推导客户检测覆盖与竞品",
  },
  {
    label: "试剂品牌",
    key: "devices[].reagentBrand",
    type: "text",
    hint: "该设备使用的试剂品牌",
  },
  {
    label: "月样本量",
    key: "devices[].monthlySampleVolume",
    type: "text",
    hint: "月均样本量",
  },
  {
    label: "科室负责人",
    key: "devices[].deptHead",
    type: "text",
    hint: "科室负责人姓名",
  },
  {
    label: "渠道CSA",
    key: "devices[].channelCsa",
    type: "text",
    hint: "渠道 CSA",
  },
  {
    label: "客户服务评价",
    key: "devices[].serviceEvaluation",
    type: "enum",
    hint: DEVICE_SERVICE_EVALUATION_OPTIONS.join("；"),
  },
];

function orderDeviceCollectFields(
  field: SurveyField,
): typeof DEFAULT_DEVICE_BLOCK_COLLECT_FIELDS {
  const byShort = new Map(
    DEFAULT_DEVICE_BLOCK_COLLECT_FIELDS.map((f) => [
      f.key.replace(/^devices\[\]\./, ""),
      f,
    ]),
  );
  const shortOrder = normalizeDeviceSubFieldOrder(field.subFieldOrder);
  const seen = new Set<string>();
  const out: typeof DEFAULT_DEVICE_BLOCK_COLLECT_FIELDS = [];
  for (const k of shortOrder) {
    const hit = byShort.get(k);
    if (hit && !seen.has(k)) {
      out.push(hit);
      seen.add(k);
    }
  }
  for (const f of DEFAULT_DEVICE_BLOCK_COLLECT_FIELDS) {
    const short = f.key.replace(/^devices\[\]\./, "");
    if (!seen.has(short)) out.push(f);
  }
  return out;
}

function specialBlockInfo(field: SurveyField): {
  title: string;
  summary: string;
  bullets: string[];
  /** 采集端实际填写的每一个子字段 */
  collectFields: { label: string; key: string; type: string; hint?: string }[];
  legacy?: boolean;
} | null {
  const typ = (field.type || "").toLowerCase();
  if (typ === "eqa_block") {
    return {
      title: "室间质评（EQA）复合块",
      summary: "采集该客户年度国考/省考参评科目，科目来自系统字典。",
      bullets: [
        "勾选科目即视为参与对应级别（国考/省考），无需单独勾「是否参评」",
        "科目字典按国考 / 省考分组展示",
        "写回 eqa_participation / eqa_participation_items",
      ],
      collectFields: [
        {
          label: "参评年份",
          key: "year",
          type: "number",
          hint: "默认当年，可改",
        },
        {
          label: "国考科目",
          key: "national.codes",
          type: "multi_select",
          hint: "勾选 ≥1 项即算参与国考；科目来自字典 scope.national",
        },
        {
          label: "省考科目",
          key: "provincial.codes",
          type: "multi_select",
          hint: "勾选 ≥1 项即算参与省考；科目来自字典 scope.provincial",
        },
      ],
    };
  }
  if (typ === "device_block") {
    return {
      title: "设备列表块",
      summary:
        "采集客户设备；每台设备归属检测线并勾选覆盖细项，从而推导客户检测覆盖与竞品。",
      bullets: [
        "可添加多台设备（每台一组下列字段）",
        "选择所属检测线后，勾选该线下细项",
        "写回客户设备及 device→assay 覆盖；看板覆盖与竞品由此推导",
        "下方列表可调整子字段展示顺序（上移 / 下移）",
        "每个子字段可单独设为必填或选填",
      ],
      collectFields: orderDeviceCollectFields(field),
    };
  }
  if (typ === "assay_block") {
    return {
      title: "检测项目树（旧块，只读保留）",
      summary:
        "历史模板中的独立检测项目采集。新模板请改用设备列表覆盖细项，避免与设备信息冲突。",
      bullets: [
        "检测线 → 类别 → 叶子项目复选（字典树）",
        "写回 hospital_assays（与设备覆盖可能重复）",
        "建议删除本块，改由「设备列表」采集覆盖",
      ],
      collectFields: [
        {
          label: "检测项目（叶子）",
          key: "codes",
          type: "multi_select",
          hint: "检测线 → 类别 → 细项复选",
        },
      ],
      legacy: true,
    };
  }
  return null;
}


function flattenEqaBooleanSubjects(
  tree: EqaFieldNode[],
  parentCode: string,
): { code: string; name: string }[] {
  const roots = tree || [];
  const parent = roots.find((n) => n.code === parentCode);
  const children =
    parent?.children?.filter((c) => c.valueType === "boolean") ||
    roots.filter(
      (n) => n.parentCode === parentCode && n.valueType === "boolean",
    );
  if (children.length) {
    return children
      .slice()
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((c) => ({ code: c.code, name: c.name }));
  }
  const prefix =
    parentCode === "scope.national"
      ? "national."
      : parentCode === "scope.provincial"
        ? "provincial."
        : "";
  const flat: EqaFieldNode[] = [];
  const walk = (nodes: EqaFieldNode[]) => {
    for (const n of nodes) {
      flat.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(roots);
  return flat
    .filter(
      (n) =>
        n.valueType === "boolean" &&
        (n.parentCode === parentCode ||
          (prefix && n.code.startsWith(prefix))),
    )
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((n) => ({ code: n.code, name: n.name }));
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
  if (
    field.type === "device_block" ||
    target === "device.block" ||
    target.startsWith("device.")
  ) {
    base.mapEntity = "device";
    base.attribute = target || "device.block";
    base.catalogTarget = base.attribute;
    base.type = "device_block";
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
  if (draft.mapEntity === "device") {
    return (draft.catalogTarget || draft.attribute || "device.block").trim() || "device.block";
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
        : domain === "device" || field.valueType === "device_block"
          ? "device"
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
  const confirmDlg = useConfirmDialog();
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

  /** 特殊块只读说明弹层（替代 window.confirm 删除） */
  const [specialBlockOpen, setSpecialBlockOpen] = useState(false);
  const [specialBlockTemplateId, setSpecialBlockTemplateId] = useState<string | null>(null);
  const [specialBlockField, setSpecialBlockField] = useState<SurveyField | null>(null);
  const [eqaSubjectCatalog, setEqaSubjectCatalog] = useState<{
    national: { code: string; name: string }[];
    provincial: { code: string; name: string }[];
    loading: boolean;
    error: string | null;
  }>({ national: [], provincial: [], loading: false, error: null });

  /** 模板内字段拖拽排序 */
  const [dragFieldKey, setDragFieldKey] = useState<string | null>(null);
  const [dragOverFieldKey, setDragOverFieldKey] = useState<string | null>(null);
  /** 模板内分组拖拽排序 */
  const [dragSectionName, setDragSectionName] = useState<string | null>(null);
  const [dragOverSectionName, setDragOverSectionName] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard/surveys/tasks");
    }
  }, [user, router]);


  useEffect(() => {
    if (!specialBlockOpen || (specialBlockField?.type || "").toLowerCase() !== "eqa_block") {
      return;
    }
    let cancelled = false;
    setEqaSubjectCatalog((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      const res = await fetchEqaFields();
      if (cancelled) return;
      if (res.error) {
        setEqaSubjectCatalog({
          national: [],
          provincial: [],
          loading: false,
          error: res.error,
        });
        return;
      }
      const tree = res.data?.items || [];
      setEqaSubjectCatalog({
        national: flattenEqaBooleanSubjects(tree, "scope.national"),
        provincial: flattenEqaBooleanSubjects(tree, "scope.provincial"),
        loading: false,
        error: null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [specialBlockOpen, specialBlockField]);


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

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const onDeleteTemplate = async (item: SurveyTemplate, e?: MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const okDel = await confirmDlg.ask({
      title: "删除模板",
      description: `确定删除模板「${item.title}」？\n（软删除：从列表隐藏，已有发放任务不受影响）`,
      confirmLabel: "删除",
    });
    if (!okDel) return;
    setDeletingId(item.id);
    setError(null);
    let res = await deleteSurveyTemplate(item.id, false);
    if (res.needsForce) {
      const ok = await confirmDlg.ask({
        title: "强制归档模板",
        description: `${res.error || "仍有发放引用此模板。"}\n\n仍要强制归档？`,
        confirmLabel: "强制归档",
      });
      if (!ok) {
        setDeletingId(null);
        return;
      }
      res = await deleteSurveyTemplate(item.id, true);
    }
    setDeletingId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setItems((prev) => prev.filter((t) => t.id !== item.id));
    setExpanded((prev) => (prev === item.id ? null : prev));
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
    if (specialBlockInfo(field)) {
      setError(null);
      setSpecialBlockTemplateId(template.id);
      setSpecialBlockField(field);
      setSpecialBlockOpen(true);
      return;
    }
    setEditingTemplateId(template.id);
    setFieldMode("edit");
    setEditingOriginalKey(field.key);
    setFieldDraft(draftFromField(field));
    setFieldDialogOpen(true);
  };

  const onDeleteSpecialBlock = async () => {
    if (!specialBlockTemplateId || !specialBlockField) return;
    const template = items.find((t) => t.id === specialBlockTemplateId);
    if (!template) return;
    const schema = normalizeSchema(template.schema);
    const fields = (schema.fields || []).filter((f) => f.key !== specialBlockField.key);
    if (
      schemaHasCustomerDependentBlocks(fields) &&
      !schemaHasHospitalIdentity(fields)
    ) {
      setError(
        "无法删除：模板仍含设备/EQA，必须保留「医院名称」等客户身份字段。",
      );
      return;
    }
    setError(null);
    const ok = await persistSchema(template, { fields, sections: schema.sections });
    if (ok) {
      setSpecialBlockOpen(false);
      setSpecialBlockField(null);
      setSpecialBlockTemplateId(null);
    }
  };

  const reorderDeviceSubField = async (key: string, dir: -1 | 1) => {
    if (!specialBlockTemplateId || !specialBlockField) return;
    if ((specialBlockField.type || "").toLowerCase() !== "device_block") return;
    const template = items.find((t) => t.id === specialBlockTemplateId);
    if (!template) return;
    const prevField = specialBlockField;
    const ordered = orderDeviceCollectFields(specialBlockField);
    const idx = ordered.findIndex((f) => f.key === key);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= ordered.length) return;
    const keys = ordered.map((f) => f.key);
    const tmp = keys[idx];
    keys[idx] = keys[nextIdx]!;
    keys[nextIdx] = tmp!;
    // Persist short keys so fill UI / preview share one canonical order.
    const shortKeys = normalizeDeviceSubFieldOrder(keys);
    const schema = normalizeSchema(template.schema);
    const fields = (schema.fields || []).map((f) =>
      f.key === specialBlockField.key
        ? { ...f, subFieldOrder: shortKeys }
        : f,
    );
    // Optimistic: list + preview update immediately.
    setSpecialBlockField({ ...specialBlockField, subFieldOrder: shortKeys });
    setItems((prev) =>
      prev.map((t) =>
        t.id !== template.id
          ? t
          : {
              ...t,
              schema: { fields, sections: schema.sections },
            },
      ),
    );
    setError(null);
    const ok = await persistSchema(
      { ...template, schema: { fields, sections: schema.sections } },
      { fields, sections: schema.sections },
    );
    if (!ok) {
      setSpecialBlockField(prevField);
      setItems((prev) =>
        prev.map((t) => (t.id === template.id ? template : t)),
      );
    }
  };

  const toggleDeviceSubFieldRequired = async (key: string) => {
    if (!specialBlockTemplateId || !specialBlockField) return;
    if ((specialBlockField.type || "").toLowerCase() !== "device_block") return;
    const template = items.find((t) => t.id === specialBlockTemplateId);
    if (!template) return;
    const prevField = specialBlockField;
    const short = key.replace(/^devices\[\]\./, "") as DeviceSubFieldKey;
    const current = new Set(
      normalizeDeviceSubFieldRequired(specialBlockField.subFieldRequired),
    );
    if (current.has(short)) current.delete(short);
    else current.add(short);
    // Persist explicit list (even empty) so defaults no longer apply.
    const nextRequired = normalizeDeviceSubFieldOrder(
      Array.from(current),
    ).filter((k) => current.has(k));
    const schema = normalizeSchema(template.schema);
    const fields = (schema.fields || []).map((f) =>
      f.key === specialBlockField.key
        ? { ...f, subFieldRequired: nextRequired }
        : f,
    );
    setSpecialBlockField({
      ...specialBlockField,
      subFieldRequired: nextRequired,
    });
    setItems((prev) =>
      prev.map((t) =>
        t.id !== template.id
          ? t
          : {
              ...t,
              schema: { fields, sections: schema.sections },
            },
      ),
    );
    setError(null);
    const ok = await persistSchema(
      { ...template, schema: { fields, sections: schema.sections } },
      { fields, sections: schema.sections },
    );
    if (!ok) {
      setSpecialBlockField(prevField);
      setItems((prev) =>
        prev.map((t) => (t.id === template.id ? template : t)),
      );
    }
  };


  const reorderFields = async (
    template: SurveyTemplate,
    fromKey: string,
    toKey: string,
  ) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const schema = normalizeSchema(template.schema);
    const fields = [...(schema.fields || [])];
    const fromIdx = fields.findIndex((f) => f.key === fromKey);
    const toIdx = fields.findIndex((f) => f.key === toKey);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = fields.splice(fromIdx, 1);
    const target = fields.find((f) => f.key === toKey);
    if (target?.section) {
      moved.section = target.section;
    }
    const insertAt = fields.findIndex((f) => f.key === toKey);
    // Dragging downward: place after target; upward: place before target
    if (fromIdx < toIdx) {
      fields.splice(insertAt + 1, 0, moved);
    } else {
      fields.splice(insertAt, 0, moved);
    }
    setError(null);
    await persistSchema(template, { fields, sections: schema.sections });
  };

  const reorderSections = async (
    template: SurveyTemplate,
    fromSection: string,
    toSection: string,
  ) => {
    if (!fromSection || !toSection || fromSection === toSection) return;
    const schema = normalizeSchema(template.schema);
    const sections = [...(schema.sections || [])];
    const fromIdx = sections.indexOf(fromSection);
    const toIdx = sections.indexOf(toSection);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = sections.splice(fromIdx, 1);
    // Dragging downward: place after target; upward: place before target
    if (fromIdx < toIdx) {
      sections.splice(toIdx, 0, moved);
    } else {
      sections.splice(toIdx, 0, moved);
    }
    const nextSchema = { fields: schema.fields || [], sections };
    // Optimistic update so the list jumps immediately
    const prev = template;
    setItems((list) =>
      list.map((t) =>
        t.id === template.id ? { ...t, schema: nextSchema } : t,
      ),
    );
    setError(null);
    const ok = await persistSchema(
      { ...template, schema: nextSchema },
      nextSchema,
    );
    if (!ok) {
      setItems((list) => list.map((t) => (t.id === template.id ? prev : t)));
    }
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

    if (
      schemaHasCustomerDependentBlocks(fields) &&
      !schemaHasHospitalIdentity(fields)
    ) {
      setError(CUSTOMER_BLOCK_PREREQ_MSG);
      return;
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
    const okDelField = await confirmDlg.ask({
      title: "删除字段",
      description: `确定删除字段「${fieldDraft.label || editingOriginalKey}」？`,
      confirmLabel: "删除",
    });
    if (!okDelField) return;
    const schema = normalizeSchema(template.schema);
    const fields = (schema.fields || []).filter((f) => f.key !== editingOriginalKey);
    if (
      schemaHasCustomerDependentBlocks(fields) &&
      !schemaHasHospitalIdentity(fields)
    ) {
      setError(
        "无法删除：模板仍含设备/EQA（或旧检测项目块），必须保留「医院名称」等客户身份字段。",
      );
      return;
    }
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
    if (!schemaHasHospitalIdentity(schema.fields)) {
      setError(CUSTOMER_BLOCK_PREREQ_MSG);
      return;
    }
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

  const onInsertDeviceBlock = async (template: SurveyTemplate, section?: string) => {
    const schema = normalizeSchema(template.schema);
    if (!schemaHasHospitalIdentity(schema.fields)) {
      setError(CUSTOMER_BLOCK_PREREQ_MSG);
      return;
    }
    if ((schema.fields || []).some((f) => f.type === "device_block")) {
      setError("该模板已有设备列表块，每个模板只需一个");
      return;
    }
    const sec = (section || "设备").trim() || "设备";
    const key = ensureUniqueFieldKey("devices", (schema.fields || []).map((f) => f.key));
    const nextField: SurveyField = {
      key,
      label: "设备列表",
      section: sec,
      type: "device_block",
      target: "device.block",
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
    const okDelSec = await confirmDlg.ask({
      title: "删除分组",
      description: msg,
      confirmLabel: "删除",
    });
    if (!okDelSec) return;
    const fields = (schema.fields || []).filter(
      (f) => (f.section || "未分组") !== section,
    );
    if (
      schemaHasCustomerDependentBlocks(fields) &&
      !schemaHasHospitalIdentity(fields)
    ) {
      setError(
        "无法删除该分组：删除后将失去客户身份字段，但模板仍含设备/EQA（或旧检测项目块）。",
      );
      return;
    }
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
            <div
              key={section}
              onDragOver={(e) => {
                // Accept section drops only (not field cards)
                if (!Array.from(e.dataTransfer.types).includes("application/x-mindray-section")) {
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                if (dragOverSectionName !== section) {
                  setDragOverSectionName(section);
                }
              }}
              onDragLeave={() => {
                if (dragOverSectionName === section) setDragOverSectionName(null);
              }}
              onDrop={(e) => {
                if (!Array.from(e.dataTransfer.types).includes("application/x-mindray-section")) {
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                const from =
                  e.dataTransfer.getData("application/x-mindray-section") ||
                  dragSectionName;
                setDragOverSectionName(null);
                setDragSectionName(null);
                if (from) void reorderSections(item, from, section);
              }}
              className={`rounded-md transition ${
                dragOverSectionName === section && dragSectionName !== section
                  ? "ring-2 ring-primary/40"
                  : ""
              } ${dragSectionName === section ? "opacity-60" : ""}`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  draggable
                  title="拖动调整分组顺序"
                  className="inline-flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setDragSectionName(section);
                    setDragFieldKey(null);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("application/x-mindray-section", section);
                    // Some browsers require text/plain for DnD to work
                    e.dataTransfer.setData("text/plain", `section:${section}`);
                  }}
                  onDragEnd={() => {
                    setDragSectionName(null);
                    setDragOverSectionName(null);
                  }}
                >
                  <GripVertical className="h-4 w-4" aria-hidden />
                </span>
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
                  <div
                    key={f.key}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setDragFieldKey(f.key);
                      setDragSectionName(null);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("application/x-mindray-field", f.key);
                      e.dataTransfer.setData("text/plain", f.key);
                    }}
                    onDragEnd={() => {
                      setDragFieldKey(null);
                      setDragOverFieldKey(null);
                    }}
                    onDragOver={(e) => {
                      // Let section drops bubble to the group container
                      if (
                        Array.from(e.dataTransfer.types).includes(
                          "application/x-mindray-section",
                        )
                      ) {
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverFieldKey !== f.key) setDragOverFieldKey(f.key);
                    }}
                    onDragLeave={() => {
                      if (dragOverFieldKey === f.key) setDragOverFieldKey(null);
                    }}
                    onDrop={(e) => {
                      // Let section drops bubble to the group container
                      if (
                        Array.from(e.dataTransfer.types).includes(
                          "application/x-mindray-section",
                        )
                      ) {
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      const from =
                        e.dataTransfer.getData("application/x-mindray-field") ||
                        e.dataTransfer.getData("text/plain") ||
                        dragFieldKey;
                      setDragOverFieldKey(null);
                      setDragFieldKey(null);
                      if (from && !from.startsWith("section:")) {
                        void reorderFields(item, from, f.key);
                      }
                    }}
                    className={`rounded-md border bg-background text-left text-sm transition hover:border-primary/40 hover:bg-accent/40 ${
                      dragOverFieldKey === f.key && dragFieldKey !== f.key
                        ? "border-primary ring-1 ring-primary/40"
                        : ""
                    } ${dragFieldKey === f.key ? "opacity-60" : ""}`}
                  >
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditField(item, f);
                      }}
                    >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 font-medium">
                        <GripVertical
                          className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground"
                          aria-hidden
                        />
                        <span className="truncate">{f.label}</span>
                      </span>
                      <div className="flex items-center gap-1">
                        {f.type === "assay_block" ? (
                          <Badge variant="outline">旧</Badge>
                        ) : null}
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
                        旧块 · 建议改用设备列表覆盖；点击查看说明
                      </p>
                    ) : f.type === "device_block" ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        设备列表 → 所属检测线 + 细项（写回客户设备）
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
                  </div>
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
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                客户属性 · 特殊块
              </p>
              <p className="mb-2 max-w-xl text-xs text-muted-foreground">
                设备列表、室间质评挂在客户（医院）实体上。请先添加「医院名称」等身份字段再插入。检测覆盖由设备细项推导，不再提供「插入检测项目」。
              </p>
              {error ? (
                <p className="mb-2 text-sm text-destructive">{error}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const fields = normalizeSchema(item.schema).fields || [];
                  const hasIdentity = schemaHasHospitalIdentity(fields);
                  const hasEqa = fields.some((f) => f.type === "eqa_block");
                  const hasAssay = fields.some((f) => f.type === "assay_block");
                  const hasDevice = fields.some((f) => f.type === "device_block");
                  const blockBtnClass = (already: boolean) =>
                    `flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-background/60 px-4 text-sm transition sm:min-w-[140px] ${
                      already || !hasIdentity
                        ? "cursor-not-allowed text-muted-foreground/70 opacity-70"
                        : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`;
                  const prereqTitle = !hasIdentity
                    ? "请先添加「医院名称」字段（绑定 hospital.name）"
                    : undefined;
                  return (
                    <>
                      <button
                        type="button"
                        className={blockBtnClass(hasEqa)}
                        disabled={saving || !hasIdentity || hasEqa}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onInsertEqaBlock(item);
                        }}
                        title={
                          prereqTitle ||
                          (hasEqa
                            ? "该模板已有 EQA 块，每个模板只需一个"
                            : "插入 EQA 复合块")
                        }
                      >
                        <Plus className="h-5 w-5" />
                        <span>{hasEqa ? "已有 EQA" : "插入 EQA"}</span>
                      </button>
                      {hasAssay ? (
                        <div className="flex min-h-[72px] max-w-xs flex-col justify-center rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground sm:min-w-[180px]">
                          <span className="font-medium text-foreground">旧模板含「检测项目」块</span>
                          <span className="mt-1">
                            检测覆盖请改由设备列表采集；点击该块可查看说明并删除，避免与设备信息冲突。
                          </span>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={blockBtnClass(hasDevice)}
                        disabled={saving || !hasIdentity || hasDevice}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onInsertDeviceBlock(item);
                        }}
                        title={
                          prereqTitle ||
                          (hasDevice
                            ? "该模板已有设备列表块，每个模板只需一个"
                            : "插入设备列表（检测线+细项）")
                        }
                      >
                        <Plus className="h-5 w-5" />
                        <span>{hasDevice ? "已有设备列表" : "插入设备列表"}</span>
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
                  <TableHead className="w-20 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
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
                          <TableCell className="text-right" onClick={(ev) => ev.stopPropagation()}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-destructive hover:text-destructive"
                              disabled={deletingId === item.id || saving}
                              onClick={(ev) => onDeleteTemplate(item, ev)}
                            >
                              {deletingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              <span className="ml-1">删除</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30 p-4">
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
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        className="flex min-h-10 min-w-0 flex-1 flex-col gap-2 text-left"
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 text-destructive hover:text-destructive"
                        disabled={deletingId === item.id || saving}
                        onClick={(ev) => onDeleteTemplate(item, ev)}
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
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
              <Label>采集目标</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                客户（医院）实体属性
              </div>
              <p className="text-xs text-muted-foreground">
                普通字段从客户属性目录勾选。设备列表 / 室间质评请用模板下方「客户属性 · 特殊块」插入（需先有医院名称）。检测覆盖由设备列表推导。
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
                  {(catalogByDomain.hospital || []).filter(
                    (f) =>
                      f.domain !== "eqa" &&
                      f.domain !== "assay" &&
                      f.domain !== "device" &&
                      f.valueType !== "eqa_block" &&
                      f.valueType !== "assay_block" &&
                      f.valueType !== "device_block" &&
                      !f.storageTarget.startsWith("eqa.") &&
                      !f.storageTarget.startsWith("assay.") &&
                      !f.storageTarget.startsWith("device.") &&
                      !f.storageTarget.includes("mindrayProjects") &&
                      !f.storageTarget.includes("newProjects"),
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

      <Dialog
        open={specialBlockOpen}
        onOpenChange={(open) => {
          setSpecialBlockOpen(open);
          if (!open) {
            setSpecialBlockField(null);
            setSpecialBlockTemplateId(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b px-5 py-4">
            <DialogTitle>
              {specialBlockField
                ? specialBlockInfo(specialBlockField)?.title ||
                  specialBlockField.label ||
                  specialBlockField.key
                : "特殊块"}
            </DialogTitle>
            <DialogDescription>
              {specialBlockField
                ? specialBlockInfo(specialBlockField)?.summary ||
                  "查看该特殊块采集的每一个字段"
                : "查看采集字段明细"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4 text-sm">
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {specialBlockField ? (
              <>
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">模板字段</div>
                  <div className="font-medium">
                    {specialBlockField.label || specialBlockField.key}
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    key: {specialBlockField.key}
                    {specialBlockField.target
                      ? ` · target: ${specialBlockField.target}`
                      : ""}
                    {" · "}
                    {typeLabel(specialBlockField.type || "")}
                  </div>
                </div>
                {specialBlockInfo(specialBlockField)?.legacy ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                    此为历史「检测项目」块。新采集请用设备列表覆盖细项；可在此删除本块以免与设备信息冲突。
                  </p>
                ) : null}

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold">本块采集的全部字段</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      采集员在填报端会填写下列每一项（模板结构预览，无答卷值）。
                      {(specialBlockField.type || "").toLowerCase() ===
                      "device_block"
                        ? " 可用上下箭头调整子字段顺序；点「必填/选填」切换是否必填。"
                        : ""}
                    </p>
                  </div>

                  {(specialBlockField.type || "").toLowerCase() === "eqa_block" ? (
                    <div className="space-y-4">
                      <div className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">参评年份</div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              year
                            </div>
                          </div>
                          <Badge variant="outline">数字</Badge>
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          默认当年，可改
                        </p>
                      </div>

                      {specialBlockField.enableNational !== false ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">国家级（国考）科目</p>
                            <Badge variant="secondary">
                              {eqaSubjectCatalog.loading
                                ? "加载中…"
                                : `${eqaSubjectCatalog.national.length} 项`}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              勾选任一科目即算参与国考
                            </span>
                          </div>
                          {eqaSubjectCatalog.error ? (
                            <p className="text-xs text-destructive">
                              {eqaSubjectCatalog.error}
                            </p>
                          ) : null}
                          <div className="grid gap-2 sm:grid-cols-2">
                            {eqaSubjectCatalog.national.map((s) => (
                              <div
                                key={s.code}
                                className="rounded-md border bg-background px-3 py-2"
                              >
                                <div className="font-medium">{s.name}</div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {s.code}
                                  </span>
                                  <Badge variant="outline" className="text-[10px]">
                                    是/否
                                  </Badge>
                                </div>
                              </div>
                            ))}
                            {!eqaSubjectCatalog.loading &&
                            !eqaSubjectCatalog.error &&
                            eqaSubjectCatalog.national.length === 0 ? (
                              <p className="text-xs text-muted-foreground sm:col-span-2">
                                暂无国考科目字典
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {specialBlockField.enableProvincial !== false ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">省级（省考）科目</p>
                            <Badge variant="secondary">
                              {eqaSubjectCatalog.loading
                                ? "加载中…"
                                : `${eqaSubjectCatalog.provincial.length} 项`}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              勾选任一科目即算参与省考
                            </span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {eqaSubjectCatalog.provincial.map((s) => (
                              <div
                                key={s.code}
                                className="rounded-md border bg-background px-3 py-2"
                              >
                                <div className="font-medium">{s.name}</div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {s.code}
                                  </span>
                                  <Badge variant="outline" className="text-[10px]">
                                    是/否
                                  </Badge>
                                </div>
                              </div>
                            ))}
                            {!eqaSubjectCatalog.loading &&
                            !eqaSubjectCatalog.error &&
                            eqaSubjectCatalog.provincial.length === 0 ? (
                              <p className="text-xs text-muted-foreground sm:col-span-2">
                                暂无省考科目字典
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(specialBlockInfo(specialBlockField)?.collectFields || []).map(
                        (cf, i, arr) => {
                          const canReorder =
                            (specialBlockField.type || "").toLowerCase() ===
                            "device_block";
                          return (
                            <div
                              key={cf.key}
                              className="rounded-md border bg-background px-3 py-2.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-medium">
                                    {cf.label}
                                    {canReorder &&
                                    normalizeDeviceSubFieldRequired(
                                      specialBlockField.subFieldRequired,
                                    ).includes(
                                      cf.key.replace(
                                        /^devices\[\]\./,
                                        "",
                                      ) as DeviceSubFieldKey,
                                    ) ? (
                                      <span className="ml-0.5 text-destructive">
                                        *
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="font-mono text-[11px] text-muted-foreground">
                                    {cf.key}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Badge variant="outline">
                                    {typeLabel(cf.type)}
                                  </Badge>
                                  {canReorder ? (
                                    <>
                                      {(() => {
                                        const short = cf.key.replace(
                                          /^devices\[\]\./,
                                          "",
                                        );
                                        const reqSet = new Set(
                                          normalizeDeviceSubFieldRequired(
                                            specialBlockField.subFieldRequired,
                                          ),
                                        );
                                        const isReq = reqSet.has(
                                          short as DeviceSubFieldKey,
                                        );
                                        return (
                                          <Button
                                            type="button"
                                            variant={
                                              isReq ? "default" : "outline"
                                            }
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            disabled={saving}
                                            title={
                                              isReq
                                                ? "当前必填，点击改为选填"
                                                : "当前选填，点击改为必填"
                                            }
                                            onClick={() =>
                                              void toggleDeviceSubFieldRequired(
                                                cf.key,
                                              )
                                            }
                                          >
                                            {isReq ? "必填" : "选填"}
                                          </Button>
                                        );
                                      })()}
                                      <div className="flex flex-col">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          disabled={saving || i === 0}
                                          title="上移"
                                          onClick={() =>
                                            void reorderDeviceSubField(
                                              cf.key,
                                              -1,
                                            )
                                          }
                                        >
                                          <ChevronUp className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          disabled={
                                            saving || i === arr.length - 1
                                          }
                                          title="下移"
                                          onClick={() =>
                                            void reorderDeviceSubField(
                                              cf.key,
                                              1,
                                            )
                                          }
                                        >
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                              {cf.hint ? (
                                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                  {cf.hint}
                                </p>
                              ) : null}
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>

                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {(specialBlockInfo(specialBlockField)?.bullets || []).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">采集表单预览</p>
                  <p className="text-xs text-muted-foreground">
                    与填报端一致的只读预览（空值示意）。
                  </p>
                  <div className="rounded-md border bg-background p-3">
                    {(specialBlockField.type || "").toLowerCase() === "eqa_block" ? (
                      <EqaParticipationField
                        value={undefined}
                        onChange={() => {}}
                        disabled
                        config={{
                          enableNational:
                            specialBlockField.enableNational !== false,
                          enableProvincial:
                            specialBlockField.enableProvincial !== false,
                        }}
                      />
                    ) : (specialBlockField.type || "").toLowerCase() ===
                      "device_block" ? (
                      <DeviceBlockField
                        value={{
                          devices: [
                            {
                              brand: "迈瑞",
                              model: "",
                              serialNo: "",
                              installedAt: "",
                              enabledAt: "",
                              usageLocation: "",
                              assayLineCode: "",
                              itemCodes: [],
                              serviceEvaluation: "",
                              reagentBrand: "",
                              monthlySampleVolume: "",
                              deptHead: "",
                              channelCsa: "",
                            },
                          ],
                        }}
                        onChange={() => {}}
                        disabled
                        subFieldOrder={specialBlockField.subFieldOrder}
                        subFieldRequired={specialBlockField.subFieldRequired}
                      />
                    ) : (specialBlockField.type || "").toLowerCase() ===
                      "assay_block" ? (
                      <AssayTreeField
                        value={undefined}
                        onChange={() => {}}
                        disabled
                      />
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 border-t px-5 py-3">
            <Button
              type="button"
              variant="destructive"
              disabled={saving || !specialBlockField}
              onClick={() => void onDeleteSpecialBlock()}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              删除此块
            </Button>
            <div className="flex flex-1 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSpecialBlockOpen(false)}
              >
                关闭
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
      {confirmDlg.dialog}
    </div>
  );
}
