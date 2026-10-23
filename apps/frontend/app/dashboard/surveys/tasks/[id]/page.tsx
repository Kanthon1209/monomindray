"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";

import {
  getMySurveyAssignment,
  listAssayProjectOptions,
  saveSurveyDraft,
  submitSurveyAssignment,
  type HospitalSearchOption,
  type SurveyAssignment,
  type SurveyField,
} from "@/lib/business";
import { AssayMultiSelect } from "@/components/assay-multi-select";
import {
  EqaParticipationField,
  normalizeEqaBlockAnswer,
} from "@/components/eqa-participation-field";
import { HospitalNameTypeahead } from "@/components/hospital-name-typeahead";
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
];
const CUSTOMER_LEVEL_OPTIONS = [
  "战略客户",
  "重点客户",
  "普通客户",
  "潜在客户",
  "SVIP",
  "VIP",
  "非V客户",
  "V客户",
];
const TYPE_OPTIONS = ["综合医院", "专科医院", "中医医院", "妇幼保健院"];

function usesAssayDictionary(field: SurveyField): boolean {
  if (field.optionsSource === "assay_projects") return true;
  const t = field.target || "";
  if (
    t === "hospital.archive.mindrayProjects" ||
    t === "hospital.archive.newProjects"
  ) {
    return true;
  }
  return field.key === "mindrayProjects" || field.key === "newProjects";
}

function isHospitalNameField(field: SurveyField): boolean {
  if (field.optionsSource === "hospitals") return true;
  const t = (field.target || "").trim();
  if (t === "hospital.name" || t === "hospital.archive.customerName") return true;
  const key = (field.key || "").toLowerCase();
  if (key === "name" || key === "hospitalname" || key === "customername") return true;
  const label = field.label || "";
  return label.includes("客户名称") || label.includes("医院名称");
}

function customerLevelPresets(field: SurveyField): string[] | null {
  if (Array.isArray(field.options) && field.options.length) return field.options;
  const t = (field.target || "").trim();
  const key = field.key || "";
  const label = field.label || "";
  if (
    key === "customerLevel" ||
    key === "customer_level" ||
    t.includes("customerLevel") ||
    t.includes("customer_level") ||
    t.includes("customer.level") ||
    t === "hospital.attributes.customer_level" ||
    label.includes("客户等级") ||
    label.includes("客户级别")
  ) {
    return CUSTOMER_LEVEL_OPTIONS;
  }
  if (key === "level" || t === "hospital.level") {
    // 模板里「客户等级」常误绑 hospital.level；按文案优先客户等级预设
    if (label.includes("客户")) return CUSTOMER_LEVEL_OPTIONS;
    return HOSPITAL_LEVEL_OPTIONS;
  }
  return null;
}

function isHospitalTypeField(field: SurveyField): boolean {
  const t = (field.target || "").trim();
  return field.key === "type" || t === "hospital.type" || (field.label || "").includes("医院类型");
}

function asStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(/[/、,，;；|+]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function groupBySection(fields: SurveyField[]) {
  const map = new Map<string, SurveyField[]>();
  for (const f of fields) {
    if (f.type === "repeat") continue;
    const section = f.section || "其他";
    if (!map.has(section)) map.set(section, []);
    map.get(section)!.push(f);
  }
  return Array.from(map.entries());
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
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const [assignment, setAssignment] = useState<SurveyAssignment | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [assayOptions, setAssayOptions] = useState<
    { id: string; name: string; company?: string; ownership: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [linkedHospitalId, setLinkedHospitalId] = useState<number | undefined>(
    undefined,
  );

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
      }
      setAnswers(next);
      setLinkedHospitalId(
        res.assignment.hospitalId
          ? Number(res.assignment.hospitalId)
          : undefined,
      );

      const needAssay = (res.assignment.schema?.fields || []).some((f) =>
        usesAssayDictionary(f),
      );
      if (needAssay) {
        const assayRes = await listAssayProjectOptions();
        if (assayRes.items?.length) setAssayOptions(assayRes.items);
        else setAssayOptions([]);
      } else {
        setAssayOptions([]);
      }
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
  const sections = useMemo(() => groupBySection(flatFields), [flatFields]);
  const devicesField = repeatFields.find((f) => f.key === "devices") || null;

  const readOnly = assignment?.status === "submitted";
  const lockedSet = useMemo(
    () => new Set(assignment?.lockedKeys || []),
    [assignment],
  );

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

  const removeDevice = (index: number) => {
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
    if (res.error) setError(res.error);
    else {
      setMessage("草稿已保存");
      await load();
    }
  };

  const onSubmit = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await submitSurveyAssignment(id, {
      answers,
      hospitalId:
        linkedHospitalId ??
        (assignment?.hospitalId ? Number(assignment.hospitalId) : undefined),
    });
    setSaving(false);
    if (res.error) setError(res.error);
    else {
      setMessage("已提交审核");
      await load();
    }
  };

  const applyHospitalPick = (hospital: HospitalSearchOption) => {
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
      field.options.length > 0 &&
      !usesAssayDictionary(field)
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
      field.type === "string_array" ||
      field.key === "mindrayProjects" ||
      field.key === "newProjects"
    ) {
      const arr = asStringArray(value);
      return (
        <AssayMultiSelect
          value={arr}
          options={usesAssayDictionary(field) ? assayOptions : []}
          onChange={onChange}
          disabled={disabled}
          placeholder="输入内容"
          allowCustom
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
    if (field.type === "number") {
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
    if (isHospitalNameField(field)) {
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
    const levelPresets = customerLevelPresets(field);
    if (levelPresets) {
      return (
        <Select
          value={String(value || "")}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择等级" />
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
        <Badge variant="outline">{assignment.status}</Badge>
        {assignment.hospitalName ? (
          <Badge variant="secondary">{assignment.hospitalName}</Badge>
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
              : ""}
            {assignment.reviewNote
              ? ` · 驳回意见：${assignment.reviewNote}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-0 pb-6">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}

          {sections.map(([section, fields]) => {
            const eqaFields = fields.filter((f) => f.type === "eqa_block");
            const scalarFields = fields.filter((f) => f.type !== "eqa_block");
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
    </div>
  );
}
