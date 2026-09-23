"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Send } from "lucide-react";

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
    const section = f.section || "其他";
    if (!map.has(section)) map.set(section, []);
    map.get(section)!.push(f);
  }
  return Array.from(map.entries());
}

export default function SurveyTaskFillPage() {
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const [assignment, setAssignment] = useState<SurveyAssignment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
      setAnswers(res.assignment.answers || {});
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const sections = useMemo(
    () => groupBySection(assignment?.schema?.fields || []),
    [assignment],
  );

  const readOnly = assignment?.status === "submitted";
  const lockedSet = useMemo(
    () => new Set(assignment?.lockedKeys || []),
    [assignment],
  );

  const setField = (key: string, value: string) => {
    if (lockedSet.has(key)) return;
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const onSaveDraft = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await saveSurveyDraft(id, { answers });
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
    const res = await submitSurveyAssignment(id, { answers });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMessage("已提交，等待管理员审核");
    await load();
  };

  const renderField = (field: SurveyField) => {
    const value = answers[field.key] || "";
    const fieldLocked = readOnly || lockedSet.has(field.key);
    if (field.key === "level") {
      return (
        <Select
          value={value || undefined}
          onValueChange={(v) => setField(field.key, v)}
          disabled={fieldLocked}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择医院等级" />
          </SelectTrigger>
          <SelectContent>
            {LEVEL_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.key === "type") {
      return (
        <Select
          value={value || undefined}
          onValueChange={(v) => setField(field.key, v)}
          disabled={fieldLocked}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择医院类型" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        value={value}
        disabled={fieldLocked}
        onChange={(e) => setField(field.key, e.target.value)}
        placeholder={field.label}
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
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-sm text-destructive">{error || "任务不存在"}</p>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/dashboard/surveys/tasks">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回列表
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/surveys/tasks">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回
          </Link>
        </Button>
        <Badge variant="outline">{assignment.status}</Badge>
        {assignment.campaignStatus === "closed" ? (
          <Badge variant="secondary">发放已关闭</Badge>
        ) : null}
      </div>

      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <CardTitle>{assignment.campaignTitle}</CardTitle>
          <CardDescription>
            {assignment.templateTitle || assignment.templateCode}
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
                    {renderField(field)}
                  </div>
                ))}
              </div>
            </div>
          ))}

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
            <Button variant="outline" onClick={() => router.push("/dashboard/surveys/tasks")}>
              返回任务列表
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
