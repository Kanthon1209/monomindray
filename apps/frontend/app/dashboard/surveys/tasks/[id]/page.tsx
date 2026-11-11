"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Send } from "lucide-react";

import {
  getMySurveyAssignment,
  saveSurveyDraft,
  submitSurveyAssignment,
  type SurveyAssignment,
} from "@/lib/business";
import {
  SurveyAnswersForm,
  isHospitalNameField,
  normalizeSurveyFormAnswers,
  validateSurveyAnswersClient,
} from "@/components/survey-answers-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    case "approved":
      return "已通过";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
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
  const actionFeedbackRef = useRef<HTMLDivElement | null>(null);
  const [linkedHospitalId, setLinkedHospitalId] = useState<number | undefined>(
    undefined,
  );

  const showActionFeedback = (kind: "error" | "message", value: string) => {
    if (kind === "error") setError(value);
    else setMessage(value);
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
      const boundName =
        res.assignment.hospitalId && res.assignment.hospitalName
          ? res.assignment.hospitalName
          : undefined;
      const next = normalizeSurveyFormAnswers(
        res.assignment.schema?.fields || [],
        res.assignment.answers,
        boundName,
      );
      // Bound hospital name is always forced, even if a stale value is stored.
      if (boundName) {
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

  const readOnly = assignment?.status === "submitted"; // rejected 可继续改
  const hospitalBound = !!(
    assignment?.hospitalId && Number(assignment.hospitalId) > 0
  );
  const lockedKeys = useMemo(() => {
    const s = new Set(assignment?.lockedKeys || []);
    if (hospitalBound) {
      for (const f of assignment?.schema?.fields || []) {
        if (f.type === "repeat") continue;
        if (isHospitalNameField(f)) s.add(f.key);
      }
    }
    return s;
  }, [assignment, hospitalBound]);

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
      const savedHid = res.submission?.hospitalId
        ? Number(res.submission.hospitalId)
        : undefined;
      showActionFeedback("message", "草稿已保存");
      await load();
      if (savedHid && savedHid > 0) {
        setLinkedHospitalId(savedHid);
      }
    }
  };

  const onSubmit = async () => {
    setError(null);
    setMessage(null);
    const resolvedHospitalId =
      linkedHospitalId ??
      (assignment?.hospitalId ? Number(assignment.hospitalId) : undefined);
    const clientError = await validateSurveyAnswersClient({
      fields: assignment?.schema?.fields || [],
      answers,
      hospitalBound,
      hospitalOpen: assignment?.hospitalOpen,
      linkedHospitalId: resolvedHospitalId,
    });
    if (clientError) {
      showActionFeedback("error", clientError);
      return;
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
                ? " · 请输入或选择客户/医院名称（可联想已有医院或直接输入新医院）"
                : ""}
            {assignment.reviewNote
              ? ` · 驳回意见：${assignment.reviewNote}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-0 pb-6">
          <SurveyAnswersForm
            fields={assignment.schema?.fields || []}
            sections={assignment.schema?.sections}
            answers={answers}
            onAnswersChange={setAnswers}
            disabled={readOnly}
            lockedKeys={lockedKeys}
            hospitalBound={hospitalBound}
            hospitalName={assignment.hospitalName}
            onLinkedHospitalIdChange={setLinkedHospitalId}
          />

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
    </div>
  );
}
