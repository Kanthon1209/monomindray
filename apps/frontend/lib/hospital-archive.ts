/** 对齐《2024年化免客户档案》三张工作表的采集字段 */

export type ArchiveValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | CompetitorProjectItem[]
  | Record<string, unknown>;

export interface CompetitorProjectItem {
  line?: string;
  brand?: string;
  instrument?: string;
  projects?: string[];
  note?: string;
}

export type ArchiveFieldKey =
  // 化学发光
  | "region"
  | "branchOffice"
  | "customerName"
  | "customerCode"
  | "customerLevel"
  | "model"
  | "serialNo"
  | "contactName"
  | "contactPhone"
  | "installedAt"
  | "enabledAt"
  | "annualRevenue"
  | "usageLocation"
  | "projectCount"
  | "mindrayReagentCount"
  | "matchingRate"
  | "otherAnalyzers"
  | "mindraySampleVolume"
  | "totalSampleVolume"
  | "qcVendor"
  | "qcLevels"
  | "qcCycle"
  | "reagentSupplier"
  | "mindrayProjects"
  | "newProjects"
  | "unusedProjects"
  | "missingProjects"
  | "archiveRemark"
  // 竞品结构化
  | "competitorProjectDistribution"
  // SVIP
  | "groupName"
  | "svipLevel"
  | "dualMajorCustomer"
  | "volumeDirection"
  | "iotStock23"
  | "iotForecast24"
  | "iotIncrement24"
  | "iotGrowthRate24"
  | "productLineSales"
  | "productLineSalesId"
  | "reagentSales"
  | "reagentSalesId"
  | "psName"
  | "psId"
  | "clinicalApp"
  | "clinicalAppId"
  | "serviceEngineer"
  | "serviceEngineerId"
  | "equipment"
  // 双大
  | "dualMajorType"
  | "dualMajorTarget"
  | "hospitalReagentOutput"
  | "reagentOutputTarget"
  | "salesOwner"
  | "competitorDevicesProjects"
  | "mindrayDevicesProjectsVolume"
  | "supplyChannel"
  | "labDirector"
  | "workContact"
  | "customerSegment"
  | "segmentCategory";

export interface ArchiveFieldDef {
  key: ArchiveFieldKey;
  label: string;
  section: string;
  /** string | string_array | competitor_list | number */
  valueType?: "string" | "string_array" | "competitor_list" | "number";
}

export const ARCHIVE_FIELD_DEFS: ArchiveFieldDef[] = [
  { key: "region", label: "大区", section: "客户基础" },
  { key: "branchOffice", label: "分公司", section: "客户基础" },
  { key: "customerName", label: "客户名称", section: "客户基础" },
  { key: "customerCode", label: "客户代码", section: "客户基础" },
  { key: "customerLevel", label: "客户级别", section: "客户基础" },
  { key: "model", label: "机型", section: "设备信息" },
  { key: "serialNo", label: "序列号", section: "设备信息" },
  { key: "contactName", label: "负责人", section: "联系人" },
  { key: "contactPhone", label: "联系电话", section: "联系人" },
  { key: "installedAt", label: "安装日期", section: "设备信息" },
  { key: "enabledAt", label: "启用日期", section: "设备信息" },
  { key: "annualRevenue", label: "医院年收入（亿）", section: "经营数据", valueType: "number" },
  { key: "usageLocation", label: "使用位置", section: "经营数据" },
  { key: "projectCount", label: "开展项目数", section: "项目与试剂", valueType: "number" },
  { key: "mindrayReagentCount", label: "迈瑞试剂项目数", section: "项目与试剂", valueType: "number" },
  { key: "matchingRate", label: "配套率", section: "项目与试剂" },
  { key: "otherAnalyzers", label: "其它发光仪", section: "竞品与标本" },
  { key: "mindraySampleVolume", label: "迈瑞标本量", section: "竞品与标本" },
  { key: "totalSampleVolume", label: "总标本量", section: "竞品与标本" },
  { key: "qcVendor", label: "质控品厂家", section: "质控" },
  { key: "qcLevels", label: "质控水平数", section: "质控" },
  { key: "qcCycle", label: "质控周期", section: "质控" },
  { key: "reagentSupplier", label: "试剂供应商", section: "项目与试剂" },
  {
    key: "mindrayProjects",
    label: "迈瑞开展项目",
    section: "项目与试剂",
    valueType: "string_array",
  },
  { key: "newProjects", label: "主导新增项目", section: "项目与试剂", valueType: "string_array" },
  { key: "unusedProjects", label: "未使用迈瑞项目及品牌及供应商", section: "竞品与标本" },
  { key: "missingProjects", label: "迈瑞没有项目名称及品牌", section: "竞品与标本" },
  {
    key: "competitorProjectDistribution",
    label: "竞品仪器项目分布",
    section: "竞品与标本",
    valueType: "competitor_list",
  },
  { key: "archiveRemark", label: "备注", section: "其他" },
  // SVIP
  { key: "groupName", label: "分组", section: "SVIP" },
  { key: "svipLevel", label: "SVIP级别", section: "SVIP" },
  { key: "dualMajorCustomer", label: "双大客户", section: "SVIP" },
  { key: "volumeDirection", label: "上量方向", section: "SVIP" },
  { key: "iotStock23", label: "23年化免凝IOT存量(W)", section: "SVIP", valueType: "number" },
  { key: "iotForecast24", label: "24年预估化免凝IOT产出(W)", section: "SVIP", valueType: "number" },
  { key: "iotIncrement24", label: "24年预估化免凝增量(W)", section: "SVIP", valueType: "number" },
  { key: "iotGrowthRate24", label: "24年预估化免凝增长率(W)", section: "SVIP", valueType: "number" },
  { key: "equipment", label: "设备", section: "SVIP" },
  { key: "productLineSales", label: "产线销售", section: "SVIP责任人" },
  { key: "productLineSalesId", label: "产线销售工号", section: "SVIP责任人" },
  { key: "reagentSales", label: "试剂销售", section: "SVIP责任人" },
  { key: "reagentSalesId", label: "试剂销售工号", section: "SVIP责任人" },
  { key: "psName", label: "PS", section: "SVIP责任人" },
  { key: "psId", label: "PS工号", section: "SVIP责任人" },
  { key: "clinicalApp", label: "临床应用", section: "SVIP责任人" },
  { key: "clinicalAppId", label: "临床应用工号", section: "SVIP责任人" },
  { key: "serviceEngineer", label: "用服工程师", section: "SVIP责任人" },
  { key: "serviceEngineerId", label: "用服工程师工号", section: "SVIP责任人" },
  // 双大
  { key: "dualMajorType", label: "双大类型", section: "双大客户" },
  { key: "dualMajorTarget", label: "双大突破目标", section: "双大客户" },
  {
    key: "hospitalReagentOutput",
    label: "医院试剂年产出（万元）",
    section: "双大客户",
    valueType: "number",
  },
  {
    key: "reagentOutputTarget",
    label: "试剂产出目标（万元）",
    section: "双大客户",
    valueType: "number",
  },
  { key: "salesOwner", label: "销售责任人", section: "双大客户" },
  { key: "competitorDevicesProjects", label: "竞品设备+项目", section: "双大客户" },
  { key: "mindrayDevicesProjectsVolume", label: "迈瑞设备+项目+样本量", section: "双大客户" },
  { key: "supplyChannel", label: "供货渠道", section: "双大客户" },
  { key: "labDirector", label: "检验科主任", section: "双大客户" },
  { key: "workContact", label: "工作对接人", section: "双大客户" },
  { key: "customerSegment", label: "客户细分", section: "双大客户" },
  { key: "segmentCategory", label: "细分类别", section: "双大客户" },
];

/** 看板默认列（关键指标，适配窄侧栏） */
export const DASHBOARD_PRIMARY_COLUMNS: ArchiveFieldKey[] = [
  "customerName",
  "region",
  "model",
  "matchingRate",
  "mindraySampleVolume",
];

/** 展开后追加列 */
export const DASHBOARD_EXTRA_COLUMNS: ArchiveFieldKey[] = [
  "branchOffice",
  "customerLevel",
  "totalSampleVolume",
  "projectCount",
  "mindrayReagentCount",
  "contactName",
  "mindrayProjects",
];

/** @deprecated 使用 PRIMARY + EXTRA */
export const DASHBOARD_LIST_COLUMNS: ArchiveFieldKey[] = [
  ...DASHBOARD_PRIMARY_COLUMNS,
  ...DASHBOARD_EXTRA_COLUMNS,
];

export function archiveFieldLabel(key: ArchiveFieldKey | string) {
  return ARCHIVE_FIELD_DEFS.find((f) => f.key === key)?.label || key;
}

/** 模板映射下拉：已知档案键（含中文标签） */
export function listKnownArchiveKeys(extraKeys: string[] = []): {
  key: string;
  label: string;
  section: string;
  valueType?: ArchiveFieldDef["valueType"];
}[] {
  const seen = new Set<string>();
  const out: {
    key: string;
    label: string;
    section: string;
    valueType?: ArchiveFieldDef["valueType"];
  }[] = [];
  for (const def of ARCHIVE_FIELD_DEFS) {
    seen.add(def.key);
    out.push({
      key: def.key,
      label: def.label,
      section: def.section,
      valueType: def.valueType,
    });
  }
  for (const raw of extraKeys) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: key, section: "其他扩展" });
  }
  return out;
}

/** 医院表列（数据库列名 → 发布 target） */
export const HOSPITAL_COLUMNS = [
  { column: "name", target: "hospital.name" },
  { column: "province", target: "hospital.province" },
  { column: "city", target: "hospital.city" },
  { column: "district", target: "hospital.district" },
  { column: "level", target: "hospital.level" },
  { column: "type", target: "hospital.type" },
  { column: "status", target: "hospital.status" },
  { column: "address", target: "hospital.address" },
  { column: "remark", target: "hospital.remark" },
  { column: "customer_code", target: "hospital.customerCode" },
  { column: "region", target: "hospital.region" },
  { column: "branch_office", target: "hospital.branchOffice" },
] as const;

/** @deprecated 使用 HOSPITAL_COLUMNS */
export const HOSPITAL_COLUMN_TARGETS = HOSPITAL_COLUMNS.map((c) => ({
  value: c.target,
  label: c.column,
}));

/** 可扩展标签（hospital_attributes） */
export const HOSPITAL_ATTRIBUTE_KEYS = [
  "svip_level",
  "dual_major",
  "sales_group",
  "volume_direction",
  "dual_major_type",
  "dual_major_target",
  "customer_segment",
  "segment_category",
] as const;

/** 年度指标码（hospital_metrics） */
export const HOSPITAL_METRIC_CODES = [
  "sample_volume_own",
  "sample_volume_total",
  "matching_rate",
  "qc_vendor",
  "qc_levels",
  "qc_cycle",
  "hospital_annual_revenue",
  "iot_stock",
  "iot_forecast",
  "iot_increment",
  "iot_growth_rate",
  "reagent_revenue",
  "reagent_revenue_target",
] as const;

export type EntityAttrOption = {
  /** 下拉展示值：列名或 archive.xxx / attributes.xxx / metrics.xxx 或 __new_archive__ */
  value: string;
  /** 写入 target；新建 archive 时为空，由 UI 拼 */
  target?: string;
};

/** 某实体可选属性：表列 + attributes.* + metrics.* + archive.* + 新建 archive */
export function listHospitalAttributeOptions(
  extraArchiveKeys: string[] = [],
): EntityAttrOption[] {
  const cols: EntityAttrOption[] = HOSPITAL_COLUMNS.map((c) => ({
    value: c.column,
    target: c.target,
  }));
  const attrs: EntityAttrOption[] = HOSPITAL_ATTRIBUTE_KEYS.map((k) => ({
    value: `attributes.${k}`,
    target: `hospital.attributes.${k}`,
  }));
  const mets: EntityAttrOption[] = HOSPITAL_METRIC_CODES.map((k) => ({
    value: `metrics.${k}`,
    target: `hospital.metrics.${k}`,
  }));
  const archives: EntityAttrOption[] = listKnownArchiveKeys(extraArchiveKeys).map(
    (opt) => ({
      value: `archive.${opt.key}`,
      target: `hospital.archive.${opt.key}`,
    }),
  );
  return [...cols, ...attrs, ...mets, ...archives, { value: "__new_archive__" }];
}

export function splitProjectNames(raw: string): string[] {
  return raw
    .split(/[/、,，;；|+＋]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatArchiveValue(value: ArchiveValue | undefined): string {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (typeof value[0] === "string") {
      return (value as string[]).join("、");
    }
    return (value as CompetitorProjectItem[])
      .map((item) => {
        const head = [item.line, item.brand, item.instrument].filter(Boolean).join("/");
        const projects = (item.projects || []).join("、");
        const body = [projects, item.note].filter(Boolean).join(" · ");
        return [head, body].filter(Boolean).join(": ");
      })
      .join("；");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function archiveRaw(
  hospital: { archive?: Record<string, ArchiveValue> },
  key: ArchiveFieldKey,
): ArchiveValue | undefined {
  return hospital.archive?.[key];
}

/** 从医院主数据 + archive 解析单个化免字段展示值 */
export function resolveArchiveField(
  hospital: {
    name?: string;
    city?: string;
    province?: string;
    level?: string;
    remark?: string;
    deviceModels?: string[];
    archive?: Record<string, ArchiveValue>;
  },
  key: ArchiveFieldKey,
): string {
  const archive = hospital.archive || {};
  switch (key) {
    case "region":
      return (
        formatArchiveValue(archive.region) ||
        regionLabelFromCity(hospital.city) ||
        regionLabelFromProvince(hospital.province) ||
        ""
      );
    case "branchOffice":
      return formatArchiveValue(archive.branchOffice) || hospital.city || "";
    case "customerName":
      return formatArchiveValue(archive.customerName) || hospital.name || "";
    case "customerLevel":
      return formatArchiveValue(archive.customerLevel) || hospital.level || "";
    case "model":
      return formatArchiveValue(archive.model) || hospital.deviceModels?.[0] || "";
    case "mindrayProjects":
    case "newProjects":
    case "competitorProjectDistribution":
      return formatArchiveValue(archiveRaw(hospital, key));
    case "archiveRemark":
      return formatArchiveValue(archive.archiveRemark) || hospital.remark || "";
    default:
      return formatArchiveValue(archive[key]);
  }
}

export function parseNumericField(raw?: string) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/%/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatMatchingRate(raw?: string) {
  const n = parseNumericField(raw);
  if (n == null) return displayValue(raw);
  if (n <= 1) return `${(n * 100).toFixed(1)}%`;
  return `${n}%`;
}

const regionLabelByCode: Record<string, string> = {
  wanbei: "皖北",
  wanzhong: "皖中",
  wannan: "皖南",
  huabei: "华北",
  huadong: "华东",
  huanan: "华南",
  huazhong: "华中",
  xinan: "西南",
  xibei: "西北",
  dongbei: "东北",
};

const provinceRegionMap: Record<string, string> = {
  北京市: "huabei",
  天津市: "huabei",
  河北省: "huabei",
  山西省: "huabei",
  内蒙古自治区: "huabei",
  上海市: "huadong",
  江苏省: "huadong",
  浙江省: "huadong",
  安徽省: "huadong",
  福建省: "huadong",
  江西省: "huadong",
  山东省: "huadong",
  广东省: "huanan",
  广西壮族自治区: "huanan",
  海南省: "huanan",
  河南省: "huazhong",
  湖北省: "huazhong",
  湖南省: "huazhong",
  重庆市: "xinan",
  四川省: "xinan",
  贵州省: "xinan",
  云南省: "xinan",
  西藏自治区: "xinan",
  陕西省: "xibei",
  甘肃省: "xibei",
  青海省: "xibei",
  宁夏回族自治区: "xibei",
  新疆维吾尔自治区: "xibei",
  辽宁省: "dongbei",
  吉林省: "dongbei",
  黑龙江省: "dongbei",
};

const anhuiCityRegionMap: Record<string, string> = {
  宿州市: "wanbei",
  淮北市: "wanbei",
  亳州市: "wanbei",
  阜阳市: "wanbei",
  蚌埠市: "wanbei",
  淮南市: "wanbei",
  合肥市: "wanzhong",
  六安市: "wanzhong",
  滁州市: "wanzhong",
  芜湖市: "wannan",
  马鞍山市: "wannan",
  宣城市: "wannan",
  铜陵市: "wannan",
  池州市: "wannan",
  安庆市: "wannan",
  黄山市: "wannan",
};

export function regionLabelFromProvince(province?: string) {
  if (!province) return "";
  const code = provinceRegionMap[province];
  return code ? regionLabelByCode[code] || "" : "";
}

export function regionLabelFromCity(city?: string) {
  if (!city) return "";
  const normalized = city.endsWith("市") ? city : `${city}市`;
  const code = anhuiCityRegionMap[normalized];
  return code ? regionLabelByCode[code] || "" : "";
}

export function displayValue(value?: string | null) {
  const v = (value || "").trim();
  return v || "—";
}
