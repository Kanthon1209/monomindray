/** 对齐《2024年化免客户档案》Excel 表头的采集字段 */

export type ArchiveFieldKey =
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
  | "archiveRemark";

export interface ArchiveFieldDef {
  key: ArchiveFieldKey;
  label: string;
  section: string;
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
  { key: "annualRevenue", label: "医院年收入（亿）", section: "经营数据" },
  { key: "usageLocation", label: "使用位置", section: "经营数据" },
  { key: "projectCount", label: "开展项目数", section: "项目与试剂" },
  { key: "mindrayReagentCount", label: "迈瑞试剂项目数", section: "项目与试剂" },
  { key: "matchingRate", label: "配套率", section: "项目与试剂" },
  { key: "otherAnalyzers", label: "其它发光仪", section: "竞品与标本" },
  { key: "mindraySampleVolume", label: "迈瑞标本量", section: "竞品与标本" },
  { key: "totalSampleVolume", label: "总标本量", section: "竞品与标本" },
  { key: "qcVendor", label: "质控品厂家", section: "质控" },
  { key: "qcLevels", label: "质控水平数", section: "质控" },
  { key: "qcCycle", label: "质控周期", section: "质控" },
  { key: "reagentSupplier", label: "试剂供应商", section: "项目与试剂" },
  { key: "mindrayProjects", label: "迈瑞开展项目", section: "项目与试剂" },
  { key: "newProjects", label: "主导新增项目", section: "项目与试剂" },
  { key: "unusedProjects", label: "未使用迈瑞项目及品牌及供应商", section: "竞品与标本" },
  { key: "missingProjects", label: "迈瑞没有项目名称及品牌", section: "竞品与标本" },
  { key: "archiveRemark", label: "备注", section: "其他" },
];

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
