"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";

import {
  getMySurveyAssignment,
  saveSurveyDraft,
  submitSurveyAssignment,
  type HospitalSearchOption,
  type SurveyAssignment,
  type SurveyField,
} from "@/lib/business";
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

const HOSPITAL_LEVEL_OPTIONS = [
  "三级甲等",
  "三级乙等",
  "二级甲等",
  "二级乙等",
  "一级",
  "未定级",
];
const TYPE_OPTIONS = ["综合医院", "专科医院", "中医医院", "妇幼保健院"];

function isHospitalNameField(field: SurveyField): boolean {
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

function isProvinceField(field: SurveyField): boolean {
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

function isCityField(field: SurveyField): boolean {
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

function isDistrictField(field: SurveyField): boolean {
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

function assignmentStatusLabel(status: string): string {
  switch (status) {
    case "todo":
      return "待填写";
    case "in_progress":
      return "填写中";
    case "submitted":
      return "已提交";
    case "rejected":
      return "驳回";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

function asStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(/[/、,，;；|+]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function groupBySection(
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

export default function SurveyTaskFillPage() {
  const confirmDlg = useConfirmDialog();
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const [assignment, setAssignment] = useState<SurveyAssignment | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const actionFeedbackRef = useRef<HTMLDivElement | null>(null);
  const [linkedHospitalId, setLinkedHospitalId] = useState<number | undefined>(
    undefined,
  );
  const [pca, setPca] = useState<ChinaPcaData | null>(null);

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

  const showActionFeedback = (kind: "error" | "message", value: string) => {
    if (kind === "error") setError(value);
    else setMessage(value);
    // Wait for React to paint the footer banner before scrolling to it.
    window.setTimeout(() => {
      actionFeedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await getMySurveyAssignment(id);
    if (res.error) {
      setError(res.error);
      setAssignment(null);
      setLoading(false);
      return;
    }
    if (res.assignment) {
      setAssignment(res.assignment);
      const next = { ...(res.assignment.answers || {}) };
      const hasDevicesRepeat = (res.assignment.schema?.fields || []).some(
        (f) => f.type === "repeat" && f.key === "devices",
      );
      if (hasDevicesRepeat && !Array.isArray(next.devices)) next.devices = [];
      for (const f of res.assignment.schema?.fields || []) {
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
      if (res.assignment.hospitalId && res.assignment.hospitalName) {
        const boundName = res.assignment.hospitalName;
        for (const f of res.assignment.schema?.fields || []) {
          if (f.type === "repeat") continue;
          if (isHospitalNameField(f)) next[f.key] = boundName;
        }
      }
      setAnswers(next);
      setLinkedHospitalId(
        res.assignment.hospitalId
          ? Number(res.assignment.hospitalId)
          : undefined,
      );

    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const flatFields = useMemo(
    () => (assignment?.schema?.fields || []).filter((f) => f.type !== "repeat"),
    [assignment],
  );
  const repeatFields = useMemo(
    () => (assignment?.schema?.fields || []).filter((f) => f.type === "repeat"),
    [assignment],
  );
  const sections = useMemo(
    () => groupBySection(flatFields, assignment?.schema?.sections),
    [flatFields, assignment?.schema?.sections],
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

  const readOnly = assignment?.status === "submitted"; // rejected 可继续改
  const hospitalBound = !!(
    assignment?.hospitalId && Number(assignment.hospitalId) > 0
  );
  const lockedSet = useMemo(() => {
    const s = new Set(assignment?.lockedKeys || []);
    if (
      assignment?.hospitalId &&
      Number(assignment.hospitalId) > 0
    ) {
      for (const f of assignment.schema?.fields || []) {
        if (f.type === "repeat") continue;
        if (isHospitalNameField(f)) s.add(f.key);
      }
    }
    return s;
  }, [assignment]);

  const setField = (key: string, value: any) => {
    if (lockedSet.has(key)) return;
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const devices: Record<string, any>[] =
    devicesField && Array.isArray(answers.devices)
      ? answers.devices.filter(
          (row): row is Record<string, any> =>
            row != null && typeof row === "object" && !Array.isArray(row),
        )
      : [];

  const setDeviceField = (index: number, key: string, value: any) => {
    setAnswers((prev) => {
      const list = Array.isArray(prev.devices) ? [...prev.devices] : [];
      const row = { ...(list[index] || {}) };
      row[key] = value;
      list[index] = row;
      return { ...prev, devices: list };
    });
  };

  const addDevice = () => {
    if (!devicesField?.fields) return;
    setAnswers((prev) => {
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
    setAnswers((prev) => {
      const list = Array.isArray(prev.devices) ? [...prev.devices] : [];
      list.splice(index, 1);
      return { ...prev, devices: list };
    });
  };

  const onSaveDraft = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await saveSurveyDraft(id, {
      answers,
      hospitalId:
        linkedHospitalId ??
        (assignment?.hospitalId ? Number(assignment.hospitalId) : undefined),
    });
    setSaving(false);
    if (res.error) showActionFeedback("error", res.error);
    else {
      showActionFeedback("message", "草稿已保存");
      await load();
    }
  };

  const onSubmit = async () => {
    setError(null);
    setMessage(null);
    const resolvedHospitalId =
      linkedHospitalId ??
      (assignment?.hospitalId ? Number(assignment.hospitalId) : undefined);
    if (
      (assignment?.hospitalOpen || !hospitalBound) &&
      (!resolvedHospitalId || resolvedHospitalId <= 0)
    ) {
      showActionFeedback(
        "error",
        "请从医院名称联想列表中选择一家已有医院后再提交",
      );
      return;
    }
    // 省市区必须命中系统预置目录（pca / 省市表），不可自由编造
    {
      const prov = provinceFieldKey
        ? String(answers[provinceFieldKey] || "").trim()
        : "";
      const city = cityFieldKey
        ? String(answers[cityFieldKey] || "").trim()
        : "";
      const district = districtFieldKey
        ? String(answers[districtFieldKey] || "").trim()
        : "";
      if (provinceFieldKey && prov && !isCatalogProvince(prov)) {
        showActionFeedback(
          "error",
          "省份必须从系统预置列表中选择，当前值不在目录中",
        );
        return;
      }
      if (cityFieldKey && city) {
        if (!prov || !isCatalogCity(prov, city)) {
          showActionFeedback(
            "error",
            "城市必须属于所选省份，且从系统预置列表中选择",
          );
          return;
        }
      }
      if (districtFieldKey && district) {
        let pcaData = pca;
        if (!pcaData) {
          try {
            pcaData = await loadChinaPca();
          } catch {
            showActionFeedback("error", "区县目录加载失败，请稍后重试");
            return;
          }
        }
        if (!prov || !city || !isCatalogDistrict(prov, city, district, pcaData)) {
          showActionFeedback(
            "error",
            "区县必须属于所选城市，且从系统预置列表中选择",
          );
          return;
        }
      }
    }
    // device_block: enforce template-configured sub-field required flags
    for (const f of assignment?.schema?.fields || []) {
      if ((f.type || "").toLowerCase() !== "device_block") continue;
      const msg = validateDeviceBlockRequired(
        answers[f.key],
        f.subFieldRequired,
      );
      if (msg) {
        showActionFeedback("error", msg);
        return;
      }
    }
    setSaving(true);
    const res = await submitSurveyAssignment(id, {
      answers,
      hospitalId: resolvedHospitalId,
    });
    setSaving(false);
    if (res.error) showActionFeedback("error", res.error);
    else if (res.nextAssignmentId) {
      showActionFeedback("message", "已提交审核。正在打开下一份空白填报…");
      router.push(`/dashboard/surveys/tasks/${res.nextAssignmentId}`);
    } else {
      showActionFeedback("message", "已提交审核");
      await load();
    }
  };

  const applyHospitalPick = (hospital: HospitalSearchOption) => {
    if (hospitalBound) return;
    setLinkedHospitalId(Number(hospital.id));
    setAnswers((prev) => {
      const next = { ...prev };
      const fields = assignment?.schema?.fields || [];
      const fillIfPresent = (keys: string[], value?: string) => {
        if (!value) return;
        for (const f of fields) {
          if (f.type === "repeat") continue;
          if (keys.includes(f.key) || keys.includes(f.target || "")) {
            if (!next[f.key]) next[f.key] = value;
          }
        }
      };
      fillIfPresent(
        ["province", "hospital.province"],
        hospital.province,
      );
      fillIfPresent(["city", "hospital.city"], hospital.city);
      fillIfPresent(
        ["district", "hospital.district"],
        hospital.district,
      );
      // 区域由省份派生（华东/华北…）
      fillIfPresent(
        ["region", "hospital.region", "hospital.archive.region"],
        regionLabelFromProvince(hospital.province),
      );
      // 仅当表单里有医院等级（非客户等级文案）时回填 level
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
      if (disabled || hospitalBound) {
        return (
          <Input
            value={
              (value == null || value === "") && assignment?.hospitalName
                ? assignment.hospitalName
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
          placeholder="输入并选择医院"
          onChange={onChange}
          onSelectHospital={applyHospitalPick}
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

    return (
      <Input
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{error || "任务不存在"}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard/surveys/tasks">返回</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="min-h-10">
          <Link href="/dashboard/surveys/tasks">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回
          </Link>
        </Button>
        {assignment.status === "rejected" ? (
          <Badge variant="destructive">{assignmentStatusLabel(assignment.status)}</Badge>
        ) : (
          <Badge variant="outline">{assignmentStatusLabel(assignment.status)}</Badge>
        )}
        {assignment.hospitalName ? (
          <Badge variant="secondary">{assignment.hospitalName}</Badge>
        ) : assignment.hospitalOpen ? (
          <Badge variant="outline">自选医院</Badge>
        ) : null}
        {assignment.campaignStatus === "closed" ? (
          <Badge variant="secondary">发放已关闭</Badge>
        ) : null}
      </div>

      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <CardTitle>{assignment.campaignTitle}</CardTitle>
          <CardDescription>
            {assignment.templateTitle || assignment.templateCode}
            {assignment.hospitalName
              ? ` · 医院：${assignment.hospitalName}`
              : assignment.hospitalOpen
                ? " · 请输入并选择客户/医院名称（数据库联想）"
                : ""}
            {assignment.reviewNote
              ? ` · 驳回意见：${assignment.reviewNote}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-0 pb-6">
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
            return (
              <div key={section} className="space-y-4 rounded-lg border p-4 sm:p-5">
                <h3 className="text-sm font-semibold">{section}</h3>
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
                      disabled={readOnly || lockedSet.has(field.key)}
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
                      disabled={readOnly || lockedSet.has(field.key)}
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
                      disabled={readOnly || lockedSet.has(field.key)}
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
                                readOnly || lockedSet.has(field.key)
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
                              readOnly || lockedSet.has(field.key),
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
                          {lockedSet.has(field.key) ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              （已锁定）
                            </span>
                          ) : null}
                        </Label>
                        {renderScalar(
                          field,
                          answers[field.key],
                          (v) => setField(field.key, v),
                          readOnly || lockedSet.has(field.key),
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {devicesField ? (
            <div className="space-y-4 rounded-lg border p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {devicesField.label || "设备列表"}
                  {devicesField.required ? (
                    <span className="text-destructive"> *</span>
                  ) : null}
                </h3>
                {!readOnly ? (
                  <Button type="button" size="sm" variant="outline" onClick={addDevice}>
                    <Plus className="mr-1 h-4 w-4" />
                    添加{devicesField.itemLabel || "设备"}
                  </Button>
                ) : null}
              </div>
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
                    {!readOnly ? (
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
                          readOnly,
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!readOnly ? (
            <div className="space-y-3">
              <div
                ref={actionFeedbackRef}
                className="space-y-1"
                aria-live="polite"
              >
                {error ? (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                {message ? (
                  <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {message}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={saving}
                  onClick={onSaveDraft}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  保存草稿
                </Button>
                <Button
                  type="button"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={saving || assignment.campaignStatus === "closed"}
                  onClick={onSubmit}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  提交审核
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/surveys/tasks")}
            >
              返回任务列表
            </Button>
          )}
        </CardContent>
      </Card>
      {confirmDlg.dialog}
    </div>
  );
}
