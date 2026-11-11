"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import type { HospitalSearchOption, SurveyField } from "@/lib/business";
import {
  EqaParticipationField,
  normalizeEqaBlockAnswer,
} from "@/components/eqa-participation-field";
import {
  AssayTreeField,
  normalizeAssayBlockAnswer,
} from "@/components/assay-tree-field";
import {
  DeviceBlockField,
  normalizeDeviceBlockAnswer,
  validateDeviceBlockRequired,
} from "@/components/device-block-field";
import { DateMaskInput, parseTypedDate } from "@/components/ui/date-mask-input";
import { HospitalNameTypeahead } from "@/components/hospital-name-typeahead";
import { ComboboxInput } from "@/components/ui/combobox-input";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  CHINA_PROVINCES,
  citiesForProvince,
  districtsForCity,
  isCatalogCity,
  isCatalogDistrict,
  isCatalogProvince,
  loadChinaPca,
  type ChinaPcaData,
} from "@/lib/china-regions";
import { regionLabelFromProvince } from "@/lib/hospital-archive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HOSPITAL_LEVEL_OPTIONS = [
  "三级甲等",
  "三级乙等",
  "二级甲等",
  "二级乙等",
  "一级",
  "未定级",
];
const TYPE_OPTIONS = ["综合医院", "专科医院", "中医医院", "妇幼保健院"];

export function isHospitalNameField(field: SurveyField): boolean {
  if (field.optionsSource === "hospitals") return true;
  const t = (field.target || "").trim();
  if (t === "hospital.name" || t === "hospital.archive.customerName") return true;
  const key = (field.key || "").toLowerCase();
  if (key === "name" || key === "hospitalname" || key === "customername") return true;
  const label = field.label || "";
  return label.includes("客户名称") || label.includes("医院名称");
}

/** Options come from template/catalog; only hospital.level keeps a UI fallback. */
function hospitalLevelPresets(field: SurveyField): string[] | null {
  if (Array.isArray(field.options) && field.options.length) return field.options;
  const t = (field.target || "").trim();
  const key = field.key || "";
  if (key === "level" || t === "hospital.level") {
    return HOSPITAL_LEVEL_OPTIONS;
  }
  return null;
}

function isHospitalTypeField(field: SurveyField): boolean {
  const t = (field.target || "").trim();
  return field.key === "type" || t === "hospital.type" || (field.label || "").includes("医院类型");
}

export function isProvinceField(field: SurveyField): boolean {
  const t = (field.target || "").trim();
  const key = (field.key || "").toLowerCase();
  const label = field.label || "";
  return (
    key === "province" ||
    t === "hospital.province" ||
    label === "省份" ||
    label.includes("省份")
  );
}

export function isCityField(field: SurveyField): boolean {
  const t = (field.target || "").trim();
  const key = (field.key || "").toLowerCase();
  const label = field.label || "";
  return (
    key === "city" ||
    t === "hospital.city" ||
    label === "城市" ||
    (label.includes("城市") && !label.includes("区"))
  );
}

export function isDistrictField(field: SurveyField): boolean {
  const t = (field.target || "").trim();
  const key = (field.key || "").toLowerCase();
  const label = field.label || "";
  return (
    key === "district" ||
    t === "hospital.district" ||
    label === "区县" ||
    label.includes("区县")
  );
}

function isRegionField(field: SurveyField): boolean {
  const t = (field.target || "").trim();
  const key = (field.key || "").toLowerCase();
  const label = field.label || "";
  return (
    key === "region" ||
    t === "hospital.region" ||
    t === "hospital.archive.region" ||
    label === "区域" ||
    label === "大区"
  );
}


function isMspOrderNoField(field: SurveyField): boolean {
  const t = (field.target || "").trim();
  const key = (field.key || "").toLowerCase();
  const label = field.label || "";
  return (
    t === "hospital.archive.mspOrderNo" ||
    key === "msporderno" ||
    key === "msp_order_no" ||
    label === "MSP工单号" ||
    label.includes("MSP工单") ||
    label.includes("工单号")
  );
}


function asStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(/[/、,，;；|+]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function groupBySection(
  fields: SurveyField[],
  sectionOrder?: string[] | null,
) {
  const map = new Map<string, SurveyField[]>();
  for (const f of fields) {
    if (f.type === "repeat") continue;
    const section = (f.section || "其他").trim() || "其他";
    if (!map.has(section)) map.set(section, []);
    map.get(section)!.push(f);
  }
  const ordered: [string, SurveyField[]][] = [];
  const seen = new Set<string>();
  for (const name of sectionOrder || []) {
    const key = (name || "").trim();
    if (!key || seen.has(key) || !map.has(key)) continue;
    ordered.push([key, map.get(key)!]);
    seen.add(key);
  }
  for (const [key, list] of map.entries()) {
    if (seen.has(key)) continue;
    ordered.push([key, list]);
  }
  return ordered;
}

function emptyDevice(fields: SurveyField[]): Record<string, any> {
  const row: Record<string, any> = {};
  for (const f of fields) {
    if (f.type === "string_array") row[f.key] = [];
    else row[f.key] = "";
  }
  return row;
}


export function normalizeSurveyFormAnswers(
  schemaFields: SurveyField[],
  raw: Record<string, any> | undefined,
  hospitalName?: string,
): Record<string, any> {
  const next = { ...(raw || {}) };
  const hasDevicesRepeat = schemaFields.some(
    (f) => f.type === "repeat" && f.key === "devices",
  );
  if (hasDevicesRepeat && !Array.isArray(next.devices)) next.devices = [];
  for (const f of schemaFields) {
    if (f.type === "eqa_block" && (next[f.key] == null || typeof next[f.key] !== "object")) {
      next[f.key] = normalizeEqaBlockAnswer(undefined);
    }
    if (f.type === "assay_block" && (next[f.key] == null || typeof next[f.key] !== "object")) {
      next[f.key] = normalizeAssayBlockAnswer(undefined);
    }
    if (f.type === "device_block" && (next[f.key] == null || typeof next[f.key] !== "object")) {
      next[f.key] = normalizeDeviceBlockAnswer(undefined);
    }
  }
  if (hospitalName) {
    for (const f of schemaFields) {
      if (f.type === "repeat") continue;
      if (isHospitalNameField(f) && (next[f.key] == null || next[f.key] === "")) {
        next[f.key] = hospitalName;
      }
    }
  }
  return next;
}

export async function validateSurveyAnswersClient(opts: {
  fields: SurveyField[];
  answers: Record<string, any>;
  hospitalBound?: boolean;
  hospitalOpen?: boolean;
  linkedHospitalId?: number;
  pca?: ChinaPcaData | null;
}): Promise<string | null> {
  const {
    fields,
    answers,
    hospitalBound = false,
    hospitalOpen = false,
    linkedHospitalId,
  } = opts;
  const hospitalNameFields = fields.filter(isHospitalNameField);
  const typedHospitalName = hospitalNameFields
    .map((f) => String(answers[f.key] ?? "").trim())
    .find((v) => v.length > 0);
  if (
    (hospitalOpen || !hospitalBound) &&
    !typedHospitalName &&
    (!linkedHospitalId || linkedHospitalId <= 0)
  ) {
    return "请填写客户/医院名称后再提交";
  }

  const provinceFieldKey = fields.find(isProvinceField)?.key;
  const cityFieldKey = fields.find(isCityField)?.key;
  const districtFieldKey = fields.find(isDistrictField)?.key;
  const prov = provinceFieldKey
    ? String(answers[provinceFieldKey] || "").trim()
    : "";
  const city = cityFieldKey ? String(answers[cityFieldKey] || "").trim() : "";
  const district = districtFieldKey
    ? String(answers[districtFieldKey] || "").trim()
    : "";
  if (provinceFieldKey && prov && !isCatalogProvince(prov)) {
    return "省份必须从系统预置列表中选择，当前值不在目录中";
  }
  if (cityFieldKey && city) {
    if (!prov || !isCatalogCity(prov, city)) {
      return "城市必须属于所选省份，且从系统预置列表中选择";
    }
  }
  if (districtFieldKey && district) {
    let pcaData = opts.pca;
    if (!pcaData) {
      try {
        pcaData = await loadChinaPca();
      } catch {
        return "区县目录加载失败，请稍后重试";
      }
    }
    if (!prov || !city || !isCatalogDistrict(prov, city, district, pcaData)) {
      return "区县必须属于所选城市，且从系统预置列表中选择";
    }
  }

  for (const f of fields) {
    if ((f.type || "").toLowerCase() === "date") {
      const raw = String(answers[f.key] ?? "").trim();
      if (!raw) continue;
      const iso = parseTypedDate(raw);
      const fieldLabel = f.label || "日期";
      if (iso == null) {
        return `请输入完整有效的${fieldLabel}（YYYY/MM/DD）`;
      }
      if (iso !== raw) answers[f.key] = iso;
      continue;
    }
    if ((f.type || "").toLowerCase() !== "device_block") continue;
    const msg = validateDeviceBlockRequired(answers[f.key], f.subFieldRequired);
    if (msg) return msg;
  }
  return null;
}

export type SurveyAnswersFormProps = {
  fields: SurveyField[];
  sections?: string[] | null;
  answers: Record<string, any>;
  onAnswersChange: Dispatch<SetStateAction<Record<string, any>>>;
  disabled?: boolean;
  lockedKeys?: Iterable<string>;
  /** When true, campaign-locked fields stay editable (admin correcting answers). */
  allowLockedEdit?: boolean;
  hospitalBound?: boolean;
  hospitalName?: string;
  onLinkedHospitalIdChange?: (id: number | undefined) => void;
  className?: string;
};

export function SurveyAnswersForm({
  fields,
  sections: sectionOrder,
  answers,
  onAnswersChange,
  disabled = false,
  lockedKeys,
  allowLockedEdit = false,
  hospitalBound = false,
  hospitalName,
  onLinkedHospitalIdChange,
  className,
}: SurveyAnswersFormProps) {
  const confirmDlg = useConfirmDialog();
  const [pca, setPca] = useState<ChinaPcaData | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    loadChinaPca()
      .then((data) => {
        if (!cancelled) setPca(data);
      })
      .catch(() => {
        if (!cancelled) setPca(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flatFields = useMemo(
    () => fields.filter((f) => f.type !== "repeat"),
    [fields],
  );
  const repeatFields = useMemo(
    () => fields.filter((f) => f.type === "repeat"),
    [fields],
  );
  const sections = useMemo(
    () => groupBySection(flatFields, sectionOrder),
    [flatFields, sectionOrder],
  );
  const devicesField = repeatFields.find((f) => f.key === "devices") || null;

  const provinceFieldKey = useMemo(
    () => flatFields.find(isProvinceField)?.key,
    [flatFields],
  );
  const cityFieldKey = useMemo(
    () => flatFields.find(isCityField)?.key,
    [flatFields],
  );
  const districtFieldKey = useMemo(
    () => flatFields.find(isDistrictField)?.key,
    [flatFields],
  );
  const regionFieldKey = useMemo(
    () => flatFields.find(isRegionField)?.key,
    [flatFields],
  );
  const provinceValue = provinceFieldKey
    ? String(answers[provinceFieldKey] || "")
    : "";
  const cityValue = cityFieldKey ? String(answers[cityFieldKey] || "") : "";
  const cityOptions = useMemo(() => {
    const fromProvince = citiesForProvince(provinceValue);
    return fromProvince.length > 0 ? fromProvince : [];
  }, [provinceValue]);
  const districtOptions = useMemo(
    () => districtsForCity(provinceValue, cityValue, pca),
    [provinceValue, cityValue, pca],
  );

  const lockedSet = useMemo(() => {
    const s = new Set(lockedKeys || []);
    // Collectors: a bound assignment keeps 客户/医院名称 locked.
    // Admins correcting a pending submission may edit the name in place.
    if (hospitalBound && !allowLockedEdit) {
      for (const f of fields) {
        if (f.type === "repeat") continue;
        if (isHospitalNameField(f)) s.add(f.key);
      }
    }
    return s;
  }, [lockedKeys, hospitalBound, allowLockedEdit, fields]);

  const isFieldDisabled = (key: string) =>
    disabled || (!allowLockedEdit && lockedSet.has(key));

  const setField = (key: string, value: any) => {
    if (isFieldDisabled(key)) return;
    onAnswersChange((prev) => ({ ...prev, [key]: value }));
  };

  const devices: Record<string, any>[] =
    devicesField && Array.isArray(answers.devices)
      ? answers.devices.filter(
          (row): row is Record<string, any> =>
            row != null && typeof row === "object" && !Array.isArray(row),
        )
      : [];

  const setDeviceField = (index: number, key: string, value: any) => {
    onAnswersChange((prev) => {
      const list = Array.isArray(prev.devices) ? [...prev.devices] : [];
      const row = { ...(list[index] || {}) };
      row[key] = value;
      list[index] = row;
      return { ...prev, devices: list };
    });
  };

  const addDevice = () => {
    if (!devicesField?.fields) return;
    onAnswersChange((prev) => {
      const list = Array.isArray(prev.devices) ? [...prev.devices] : [];
      list.push(emptyDevice(devicesField.fields || []));
      return { ...prev, devices: list };
    });
  };

  const removeDevice = async (index: number) => {
    const ok = await confirmDlg.ask({
      title: "删除设备",
      description: `确认删除设备 #${index + 1}？`,
      confirmLabel: "删除",
    });
    if (!ok) return;
    onAnswersChange((prev) => {
      const list = Array.isArray(prev.devices) ? [...prev.devices] : [];
      list.splice(index, 1);
      return { ...prev, devices: list };
    });
  };

  const applyHospitalPick = (hospital: HospitalSearchOption) => {
    if (hospitalBound) return;
    onLinkedHospitalIdChange?.(Number(hospital.id));
    onAnswersChange((prev) => {
      const next = { ...prev };
      const fillIfPresent = (keys: string[], value?: string) => {
        if (!value) return;
        for (const f of fields) {
          if (f.type === "repeat") continue;
          if (keys.includes(f.key) || keys.includes(f.target || "")) {
            if (!next[f.key]) next[f.key] = value;
          }
        }
      };
      fillIfPresent(["province", "hospital.province"], hospital.province);
      fillIfPresent(["city", "hospital.city"], hospital.city);
      fillIfPresent(["district", "hospital.district"], hospital.district);
      fillIfPresent(
        ["region", "hospital.region", "hospital.archive.region"],
        regionLabelFromProvince(hospital.province),
      );
      for (const f of fields) {
        if (f.type === "repeat") continue;
        if (
          (f.key === "level" || f.target === "hospital.level") &&
          !(f.label || "").includes("客户") &&
          hospital.level &&
          !next[f.key]
        ) {
          next[f.key] = hospital.level;
        }
        if (
          (f.key === "type" || f.target === "hospital.type") &&
          hospital.type &&
          !next[f.key]
        ) {
          next[f.key] = hospital.type;
        }
      }
      return next;
    });
  };

  const setAnswers = onAnswersChange;

  const renderScalar = (
    field: SurveyField,
    value: any,
    onChange: (v: any) => void,
    disabled: boolean,
  ) => {
    // 多选复选框：string_array / multi_enum + options
    if (
      (field.type === "string_array" ||
        field.type === "multi_enum" ||
        field.type === "multi_select") &&
      Array.isArray(field.options) &&
      field.options.length > 0
    ) {
      const selected = new Set(asStringArray(value));
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {field.options.map((opt) => {
            const checked = selected.has(opt);
            return (
              <label
                key={opt}
                className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4 rounded border"
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(opt);
                    else next.delete(opt);
                    onChange(Array.from(next));
                  }}
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }

    if (
      field.key === "mindrayProjects" ||
      field.key === "newProjects" ||
      (field.target || "").includes("mindrayProjects") ||
      (field.target || "").includes("newProjects")
    ) {
      return (
        <p className="text-sm text-muted-foreground">
          旧版「开展项目」字段已停用，请使用模板中的「检测项目」块采集。
        </p>
      );
    }

    if (field.type === "string_array") {
      const arr = asStringArray(value);
      return (
        <Input
          value={arr.join("、")}
          disabled={disabled}
          placeholder="多项用顿号分隔"
          onChange={(e) =>
            onChange(
              e.target.value
                .split(/[/、,，;；|]+/)
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      );
    }
    if (field.type === "boolean") {
      return (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border"
            checked={!!value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{value ? "是" : "否"}</span>
        </label>
      );
    }
    if (field.type === "enum" && Array.isArray(field.options) && field.options.length) {
      return (
        <Select
          value={String(value || "")}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o === "national" ? "国家" : o === "provincial" ? "省级" : o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    // MSP工单号等可能被错标成 number；工单号需允许字母/短横线，强制文本输入
    if (field.type === "number" && !isMspOrderNoField(field)) {
      return (
        <Input
          type="number"
          value={value == null ? "" : String(value)}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
      );
    }
    if (isMspOrderNoField(field)) {
      return (
        <Input
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="输入 MSP 工单号"
          value={value == null ? "" : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    if (isHospitalNameField(field)) {
      const nameLocked = disabled || (hospitalBound && !allowLockedEdit);
      if (nameLocked) {
        return (
          <Input
            value={
              (value == null || value === "") && hospitalName
                ? hospitalName
                : value == null
                  ? ""
                  : String(value)
            }
            disabled
            readOnly
          />
        );
      }
      return (
        <HospitalNameTypeahead
          value={value == null ? "" : String(value)}
          disabled={disabled}
          placeholder="输入或选择医院名称"
          onChange={(v) => {
            // Bound identity stays; admin is renaming in place, not re-binding.
            if (!hospitalBound) {
              onLinkedHospitalIdChange?.(undefined);
            }
            onChange(v);
          }}
          onSelectHospital={hospitalBound ? undefined : applyHospitalPick}
        />
      );
    }
    const levelPresets = hospitalLevelPresets(field);
    if (levelPresets) {
      return (
        <Select
          value={String(value || "")}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {levelPresets.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (isHospitalTypeField(field)) {
      return (
        <Select
          value={String(value || "")}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择类型" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (isProvinceField(field)) {
      return (
        <ComboboxInput
          value={value == null ? "" : String(value)}
          disabled={disabled}
          placeholder="请从列表选择省份"
          options={CHINA_PROVINCES}
          onChange={(province) => {
            const exactKnown = CHINA_PROVINCES.includes(province);
            const cities = citiesForProvince(province);
            const autoRegion = exactKnown
              ? regionLabelFromProvince(province)
              : "";
            setAnswers((prev) => {
              const next = { ...prev, [field.key]: province };
              if (exactKnown && cityFieldKey) {
                const curCity = String(prev[cityFieldKey] || "");
                if (curCity && cities.length > 0 && !cities.includes(curCity)) {
                  next[cityFieldKey] = "";
                  if (districtFieldKey) next[districtFieldKey] = "";
                }
              }
              // 区域由省份派生（华东/华北…）；选中已知省时始终覆盖
              if (regionFieldKey && exactKnown) {
                next[regionFieldKey] = autoRegion;
              }
              return next;
            });
          }}
        />
      );
    }
    if (isCityField(field)) {
      return (
        <ComboboxInput
          value={value == null ? "" : String(value)}
          disabled={disabled}
          placeholder={provinceValue ? "请从列表选择城市" : "请先选择省份"}
          options={cityOptions}
          onChange={(city) => {
            const exactKnown = cityOptions.includes(city);
            setAnswers((prev) => {
              const next = { ...prev, [field.key]: city };
              if (exactKnown && districtFieldKey) {
                const cur = String(prev[districtFieldKey] || "");
                const districts = districtsForCity(
                  String(prev[provinceFieldKey || ""] || provinceValue),
                  city,
                  pca,
                );
                if (cur && districts.length > 0 && !districts.includes(cur)) {
                  next[districtFieldKey] = "";
                }
              }
              return next;
            });
          }}
        />
      );
    }
    if (isDistrictField(field)) {
      return (
        <ComboboxInput
          value={value == null ? "" : String(value)}
          disabled={disabled}
          placeholder={
            cityValue
              ? districtOptions.length
                ? "请从列表选择区县"
                : "请先选择有区县目录的城市"
              : "请先选择城市"
          }
          options={districtOptions}
          onChange={onChange}
        />
      );
    }

    if ((field.type || "").toLowerCase() === "date") {
      return (
        <DateMaskInput
          label={field.label || "日期"}
          value={value == null ? "" : String(value)}
          disabled={disabled}
          onChange={onChange}
        />
      );
    }

    return (
      <Input
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };


  return (
    <div className={className ? `space-y-5 ${className}` : "space-y-5"}>
{sections.map(([section, fields]) => {
  const eqaFields = fields.filter((f) => f.type === "eqa_block");
  const assayFields = fields.filter((f) => f.type === "assay_block");
  const deviceFields = fields.filter((f) => f.type === "device_block");
  const scalarFields = fields.filter(
    (f) =>
      f.type !== "eqa_block" &&
      f.type !== "assay_block" &&
      f.type !== "device_block",
  );
  const mostlyBoolean =
    scalarFields.length > 0 &&
    scalarFields.filter((f) => f.type === "boolean").length >=
      Math.ceil(scalarFields.length * 0.6);
  const sectionOpen = !collapsedSections[section];
  return (
    <div key={section} className="rounded-lg border">
      <button
        type="button"
        onClick={() =>
          setCollapsedSections((s) => ({
            ...s,
            [section]: !s[section],
          }))
        }
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/30 sm:px-5"
        aria-expanded={sectionOpen}
      >
        {sectionOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <h3 className="min-w-0 flex-1 text-sm font-semibold">{section}</h3>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {fields.length} 项
        </span>
      </button>
      {sectionOpen ? (
      <div className="space-y-4 border-t px-4 py-4 sm:px-5 sm:py-5">
      {eqaFields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label>
            {field.label}
            {field.required ? (
              <span className="text-destructive"> *</span>
            ) : null}
          </Label>
          <EqaParticipationField
            value={answers[field.key]}
            disabled={isFieldDisabled(field.key)}
            config={{
              enableNational: field.enableNational !== false,
              enableProvincial: field.enableProvincial !== false,
            }}
            onChange={(v) => setField(field.key, v)}
          />
        </div>
      ))}
      {assayFields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label>
            {field.label}
            {field.required ? (
              <span className="text-destructive"> *</span>
            ) : null}
          </Label>
          <AssayTreeField
            value={answers[field.key]}
            disabled={isFieldDisabled(field.key)}
            onChange={(v) => setField(field.key, v)}
          />
        </div>
      ))}
      {deviceFields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label>
            {field.label}
            {field.required ? (
              <span className="text-destructive"> *</span>
            ) : null}
          </Label>
          <DeviceBlockField
            value={answers[field.key]}
            disabled={isFieldDisabled(field.key)}
            onChange={(v) => setField(field.key, v)}
            subFieldOrder={field.subFieldOrder}
            subFieldRequired={field.subFieldRequired}
          />
        </div>
      ))}
      {scalarFields.length === 0 ? null : mostlyBoolean ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {scalarFields.map((field) => (
            <label
              key={field.key}
              className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm"
            >
              {field.type === "boolean" ? (
                <>
                  <input
                    type="checkbox"
                    className="size-4 rounded border"
                    checked={!!answers[field.key]}
                    disabled={
                      isFieldDisabled(field.key)
                    }
                    onChange={(e) =>
                      setField(field.key, e.target.checked)
                    }
                  />
                  <span>
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </span>
                </>
              ) : (
                <div className="w-full space-y-2">
                  <Label>
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </Label>
                  {renderScalar(
                    field,
                    answers[field.key],
                    (v) => setField(field.key, v),
                    isFieldDisabled(field.key),
                  )}
                </div>
              )}
            </label>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {scalarFields.map((field) => (
            <div
              key={field.key}
              className={
                (field.type === "string_array" ||
                  field.type === "multi_enum" ||
                  field.type === "multi_select") &&
                Array.isArray(field.options) &&
                field.options.length > 0
                  ? "space-y-2 md:col-span-2"
                  : "space-y-2"
              }
            >
              <Label>
                {field.label}
                {field.required ? (
                  <span className="text-destructive"> *</span>
                ) : null}
                {!allowLockedEdit && lockedSet.has(field.key) ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    （已锁定）
                  </span>
                ) : null}
              </Label>
              {renderScalar(
                field,
                answers[field.key],
                (v) => setField(field.key, v),
                isFieldDisabled(field.key),
              )}
            </div>
          ))}
        </div>
      )}
      </div>
      ) : null}
    </div>
  );
})}

{devicesField ? (
  <div className="rounded-lg border">
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={() =>
          setCollapsedSections((s) => ({
            ...s,
            __devices__: !s.__devices__,
          }))
        }
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-expanded={!collapsedSections.__devices__}
      >
        {!collapsedSections.__devices__ ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <h3 className="min-w-0 flex-1 text-sm font-semibold">
          {devicesField.label || "设备列表"}
          {devicesField.required ? (
            <span className="text-destructive"> *</span>
          ) : null}
        </h3>
      </button>
      {!disabled ? (
        <Button type="button" size="sm" variant="outline" onClick={addDevice}>
          <Plus className="mr-1 h-4 w-4" />
          添加{devicesField.itemLabel || "设备"}
        </Button>
      ) : null}
    </div>
    {!collapsedSections.__devices__ ? (
    <div className="space-y-4 border-t px-4 py-4 sm:px-5 sm:py-5">
    {devices.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        尚未添加设备。请点击「添加」录入迈瑞装机。
      </p>
    ) : null}
    {devices.map((row, index) => (
      <div
        key={index}
        className="space-y-3 rounded-md border border-dashed p-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {devicesField.itemLabel || "设备"} #{index + 1}
          </p>
          {!disabled ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => removeDevice(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(devicesField.fields || []).map((field) => (
            <div key={field.key} className="space-y-2">
              <Label>
                {field.label}
                {field.required ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </Label>
              {renderScalar(
                field,
                row[field.key],
                (v) => setDeviceField(index, field.key, v),
                disabled,
              )}
            </div>
          ))}
        </div>
      </div>
    ))}
    </div>
    ) : null}
  </div>
) : null}


      {confirmDlg.dialog}
    </div>
  );
}
