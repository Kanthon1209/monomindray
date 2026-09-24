"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";

import {
  getMySurveyAssignment,
  saveSurveyDraft,
  submitSurveyAssignment,
  type SurveyAssignment,
  type SurveyField,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LEVEL_OPTIONS = ["三级甲等", "三级乙等", "二级甲等", "二级乙等", "一级"];
const TYPE_OPTIONS = ["综合医院", "专科医院", "中医医院", "妇幼保健院"];

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await getMySurveyAssignment(id);
    if (res.error) {
      setError(res.error);
      setAssignment(null);
    } else if (res.assignment) {
      setAssignment(res.assignment);
      const next = { ...(res.assignment.answers || {}) };
      if (!Array.isArray(next.devices)) next.devices = [];
      setAnswers(next);
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
  const devicesField = repeatFields.find((f) => f.key === "devices") || repeatFields[0];

  const readOnly = assignment?.status === "submitted";
  const lockedSet = useMemo(
    () => new Set(assignment?.lockedKeys || []),
    [assignment],
  );

  const setField = (key: string, value: any) => {
    if (lockedSet.has(key)) return;
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const devices: Record<string, any>[] = Array.isArray(answers.devices)
    ? answers.devices
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
      hospitalId: assignment?.hospitalId
        ? Number(assignment.hospitalId)
        : undefined,
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
      hospitalId: assignment?.hospitalId
        ? Number(assignment.hospitalId)
        : undefined,
    });
    setSaving(false);
    if (res.error) setError(res.error);
    else {
      setMessage("已提交审核");
      await load();
    }
  };

  const renderScalar = (
    field: SurveyField,
    value: any,
    onChange: (v: any) => void,
    disabled: boolean,
  ) => {
    if (field.type === "string_array") {
      const text = Array.isArray(value) ? value.join("、") : String(value || "");
      return (
        <Input
          value={text}
          disabled={disabled}
          placeholder="多个项目用顿号或逗号分隔"
          onChange={(e) => {
            const parts = e.target.value
              .split(/[/、,，;；|+]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            onChange(parts);
          }}
        />
      );
    }
    if (field.key === "level") {
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
            {LEVEL_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.key === "type") {
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
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
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
        <CardContent className="space-y-6 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}

          {sections.map(([section, fields]) => (
            <div key={section} className="space-y-3 rounded-lg border p-4">
              <h3 className="text-sm font-semibold">{section}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.key} className="space-y-2">
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
            </div>
          ))}

          {devicesField ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
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
