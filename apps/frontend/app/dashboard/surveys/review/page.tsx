"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Check, Inbox, Loader2, RefreshCw, Save, Undo2, X } from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  approveSurveySubmission,
  listSurveySubmissions,
  previewApproveSurveySubmission,
  rejectSurveySubmission,
  unapproveSurveySubmission,
  updateSurveySubmissionAnswers,
  type SurveySubmission,
} from "@/lib/business";
import { formatTime } from "@/lib/users-admin";
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
} from "@/components/mobile-data-list";
import { useApproveOverwriteDialog } from "@/components/approve-overwrite-dialog";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { SurveyAnswersView } from "@/components/survey-answers-view";
import {
  SurveyAnswersForm,
  normalizeSurveyFormAnswers,
  validateSurveyAnswersClient,
} from "@/components/survey-answers-form";

type ReviewTab = "pending" | "approved";

type DraftState = {
  answers: Record<string, any>;
  hospitalId?: number;
};

function ReviewEditor({
  item,
  isPending,
  acting,
  rejectNote,
  onRejectNoteChange,
  draft,
  onDraftChange,
  error,
  message,
  onSave,
  onApprove,
  onReject,
  onUnapprove,
}: {
  item: SurveySubmission;
  isPending: boolean;
  acting: boolean;
  rejectNote: string;
  onRejectNoteChange: (value: string) => void;
  draft: DraftState;
  onDraftChange: (next: DraftState | ((prev: DraftState) => DraftState)) => void;
  error?: string | null;
  message?: string | null;
  onSave: () => void;
  onApprove: () => void;
  onReject: () => void;
  onUnapprove?: () => void;
}) {
  const hospitalBound = !!(item.hospitalId && Number(item.hospitalId) > 0);
  const setAnswers: Dispatch<SetStateAction<Record<string, any>>> = (
    update,
  ) => {
    onDraftChange((prev) => ({
      ...prev,
      answers: typeof update === "function" ? update(prev.answers) : update,
    }));
  };

  return (
    <div className="space-y-3">
      <div className="border-b border-border/60 pb-3 text-sm">
        <div>
          <span className="text-muted-foreground">客户：</span>
          <span className="font-medium">{item.hospitalName || "—"}</span>
        </div>
        {item.campaignTitle ? (
          <div className="mt-1 text-muted-foreground">
            发放：{item.campaignTitle}
          </div>
        ) : null}
        {item.assigneeName || item.collectorName ? (
          <div className="mt-1 text-muted-foreground">
            采集员：{item.assigneeName || item.collectorName}
            {item.assigneeEmail ? `（${item.assigneeEmail}）` : ""}
          </div>
        ) : null}
      </div>

      {isPending ? (
        <>
          <SurveyAnswersForm
            fields={item.schema?.fields || []}
            sections={item.schema?.sections}
            answers={draft.answers}
            onAnswersChange={setAnswers}
            allowLockedEdit
            hospitalBound={hospitalBound}
            hospitalName={item.hospitalName}
            onLinkedHospitalIdChange={(id) =>
              onDraftChange((prev) => ({ ...prev, hospitalId: id }))
            }
          />
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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 sm:min-h-8"
              disabled={acting}
              onClick={onSave}
            >
              {acting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              保存修改
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-10 sm:min-h-8"
              disabled={acting}
              onClick={onApprove}
            >
              {acting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              通过
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              className="w-full sm:max-w-md"
              placeholder="驳回原因（必填）"
              value={rejectNote}
              onChange={(e) => onRejectNoteChange(e.target.value)}
            />
            <Button
              variant="destructive"
              size="sm"
              className="min-h-10 sm:min-h-8"
              disabled={acting}
              onClick={onReject}
            >
              <X className="mr-1 h-4 w-4" />
              驳回
            </Button>
          </div>
        </>
      ) : (
        <>
          <SurveyAnswersView
            answers={item.answers || {}}
            fields={item.schema?.fields}
            sections={item.schema?.sections}
          />
          {item.reviewNote ? (
            <p className="text-sm text-muted-foreground">
              审核备注：{item.reviewNote}
            </p>
          ) : null}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="min-h-10 sm:min-h-8"
              disabled={acting}
              onClick={onUnapprove}
            >
              {acting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="mr-1 h-4 w-4" />
              )}
              撤销
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function SurveyReviewPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<ReviewTab>("pending");
  const [items, setItems] = useState<SurveySubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const confirm = useConfirmDialog();
  const overwriteConfirm = useApproveOverwriteDialog();

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard/surveys/tasks");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const status = tab === "pending" ? "submitted" : "approved";
    const res = await listSurveySubmissions({ status });
    if (res.error) setError(res.error);
    setItems(res.items);
    setTotal(res.total);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  useEffect(() => {
    setExpandedId(null);
    setPanelMessage(null);
    setDrafts({});
  }, [tab]);

  const initDraft = (item: SurveySubmission): DraftState => {
    const existing = draftsRef.current[item.id];
    if (existing) return existing;
    const hospitalId = item.hospitalId ? Number(item.hospitalId) : undefined;
    return {
      answers: normalizeSurveyFormAnswers(
        item.schema?.fields || [],
        item.answers,
        item.hospitalName,
      ),
      hospitalId: hospitalId && hospitalId > 0 ? hospitalId : undefined,
    };
  };

  const ensureDraft = (item: SurveySubmission) => {
    if (draftsRef.current[item.id]) return;
    const next = initDraft(item);
    setDrafts((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: next }));
  };

  const toggleExpand = (item: SurveySubmission) => {
    setPanelMessage(null);
    setError(null);
    setExpandedId((cur) => {
      if (cur === item.id) return null;
      ensureDraft(item);
      return item.id;
    });
  };

  const getDraftPayload = (item: SurveySubmission) => {
    const draft = draftsRef.current[item.id] ?? initDraft(item);
    return {
      answers: draft.answers,
      hospitalId:
        draft.hospitalId && draft.hospitalId > 0 ? draft.hospitalId : undefined,
    };
  };

  const onSave = async (item: SurveySubmission) => {
    const payload = getDraftPayload(item);
    const clientError = await validateSurveyAnswersClient({
      fields: item.schema?.fields || [],
      answers: payload.answers,
      hospitalBound: !!(item.hospitalId && Number(item.hospitalId) > 0),
      hospitalOpen: !(item.hospitalId && Number(item.hospitalId) > 0),
      linkedHospitalId: payload.hospitalId,
    });
    if (clientError) {
      setPanelMessage(null);
      setError(clientError);
      return;
    }
    setActingId(item.id);
    setError(null);
    setPanelMessage(null);
    const res = await updateSurveySubmissionAnswers(item.id, payload);
    setActingId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.submission) {
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, ...res.submission, schema: res.submission.schema || row.schema } : row)),
      );
      setDrafts((prev) => ({
        ...prev,
        [item.id]: {
          answers: normalizeSurveyFormAnswers(
            (res.submission.schema || item.schema)?.fields || [],
            res.submission.answers,
            res.submission.hospitalName || item.hospitalName,
          ),
          hospitalId: res.submission.hospitalId
            ? Number(res.submission.hospitalId)
            : payload.hospitalId,
        },
      }));
    }
    setPanelMessage("修改已保存，答卷仍待审核");
  };

  const onApprove = async (item: SurveySubmission, withEdits: boolean) => {
    const payload = withEdits || draftsRef.current[item.id] ? getDraftPayload(item) : undefined;
    if (payload) {
      const clientError = await validateSurveyAnswersClient({
        fields: item.schema?.fields || [],
        answers: payload.answers,
        hospitalBound: !!(item.hospitalId && Number(item.hospitalId) > 0),
        hospitalOpen: !(item.hospitalId && Number(item.hospitalId) > 0),
        linkedHospitalId: payload.hospitalId,
      });
      if (clientError) {
        setPanelMessage(null);
        setError(clientError);
        if (expandedId !== item.id) {
          ensureDraft(item);
          setExpandedId(item.id);
        }
        return;
      }
    }
    const approveOpts = payload
      ? { answers: payload.answers, hospitalId: payload.hospitalId }
      : undefined;
    setActingId(item.id);
    setError(null);
    setPanelMessage(null);
    const previewRes = await previewApproveSurveySubmission(item.id, approveOpts);
    if (previewRes.error) {
      setActingId(null);
      setError(previewRes.error);
      if (expandedId !== item.id) {
        ensureDraft(item);
        setExpandedId(item.id);
      }
      return;
    }
    if (previewRes.preview?.requiresConfirm) {
      setActingId(null);
      if (!(await overwriteConfirm.ask(previewRes.preview))) {
        return;
      }
      setActingId(item.id);
      setError(null);
      setPanelMessage(null);
    }
    const res = await approveSurveySubmission(item.id, approveOpts);
    setActingId(null);
    if (res.error) setError(res.error);
    else await load();
  };

  const onReject = async (item: SurveySubmission) => {
    const note = (rejectNotes[item.id] || "").trim();
    if (!note) {
      setError("驳回请填写原因");
      return;
    }
    setActingId(item.id);
    setError(null);
    setPanelMessage(null);
    const res = await rejectSurveySubmission(item.id, note);
    setActingId(null);
    if (res.error) setError(res.error);
    else await load();
  };

  const onUnapprove = async (item: SurveySubmission) => {
    if (
      !(await confirm.ask({
        title: "撤销通过？",
        description:
          "撤销后，这份答卷会回到待审核，答案恢复为管理员修改前的内容，并尝试把客户资料回滚到此次通过之前。此操作需要再次审核通过才会重新发布。",
        confirmLabel: "撤销",
        destructive: true,
      }))
    ) {
      return;
    }
    setActingId(item.id);
    setError(null);
    setPanelMessage(null);
    const res = await unapproveSurveySubmission(item.id);
    setActingId(null);
    if (res.error) {
      setError(res.error);
      if (expandedId !== item.id) {
        setExpandedId(item.id);
      }
      return;
    }
    setExpandedId(null);
    setPanelMessage(res.message || "答卷已回到待审核");
    await load();
  };

  if (!user || user.role !== "admin") return null;

  const isPending = tab === "pending";
  const emptyLabel = isPending ? "暂无待审答卷" : "暂无已通过记录";

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Inbox className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>答卷审核</CardTitle>
                <CardDescription>
                  {isPending
                    ? `审核采集员提交的问卷，可直接修改后再通过。待审 ${total} 份。`
                    : `已通过答卷保留审核记录，共 ${total} 份。`}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={isPending ? "secondary" : "ghost"}
                  className="h-8"
                  onClick={() => setTab("pending")}
                >
                  待审核
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!isPending ? "secondary" : "ghost"}
                  className="h-8"
                  onClick={() => setTab("approved")}
                >
                  已通过
                </Button>
              </div>
              <Button variant="outline" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {error && !expandedId ? (
            <p className="mb-3 text-sm text-destructive">{error}</p>
          ) : null}
          {panelMessage && !expandedId ? (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {panelMessage}
            </p>
          ) : null}
          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客户</TableHead>
                  <TableHead>发放</TableHead>
                  <TableHead>采集员</TableHead>
                  <TableHead>提交时间</TableHead>
                  {isPending ? null : <TableHead>审核时间</TableHead>}
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={isPending ? 6 : 7} className="text-center text-muted-foreground">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isPending ? 6 : 7} className="text-center text-muted-foreground">
                      {emptyLabel}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <Fragment key={item.id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          {item.hospitalName || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.campaignTitle || "—"}
                        </TableCell>
                        <TableCell>
                          <div>{item.assigneeName || item.collectorName || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.assigneeEmail}
                          </div>
                        </TableCell>
                        <TableCell>{formatTime(item.submittedAt)}</TableCell>
                        {isPending ? null : (
                          <TableCell>{formatTime(item.reviewedAt)}</TableCell>
                        )}
                        <TableCell>
                          {isPending ? (
                            <Badge variant="warning">待审核</Badge>
                          ) : (
                            <Badge variant="success">已通过</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpand(item)}
                            >
                              {expandedId === item.id ? "收起" : isPending ? "查看 / 修改" : "查看"}
                            </Button>
                            {isPending ? (
                              <Button
                                size="sm"
                                disabled={actingId === item.id}
                                onClick={() => onApprove(item, expandedId === item.id)}
                              >
                                {actingId === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="mr-1 h-4 w-4" />
                                    通过
                                  </>
                                )}
                              </Button>
                            ) : (
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={actingId === item.id}
                                onClick={() => onUnapprove(item)}
                              >
                                {actingId === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Undo2 className="mr-1 h-4 w-4" />
                                    撤销
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedId === item.id ? (
                        <TableRow>
                          <TableCell colSpan={isPending ? 6 : 7} className="bg-muted/30">
                            <ReviewEditor
                              item={item}
                              isPending={isPending}
                              acting={actingId === item.id}
                              rejectNote={rejectNotes[item.id] || ""}
                              onRejectNoteChange={(value) =>
                                setRejectNotes((prev) => ({ ...prev, [item.id]: value }))
                              }
                              draft={drafts[item.id] || initDraft(item)}
                              onDraftChange={(update) =>
                                setDrafts((prev) => {
                                  const cur = prev[item.id] || initDraft(item);
                                  const next =
                                    typeof update === "function" ? update(cur) : update;
                                  return { ...prev, [item.id]: next };
                                })
                              }
                              error={error}
                              message={panelMessage}
                              onSave={() => onSave(item)}
                              onApprove={() => onApprove(item, true)}
                              onReject={() => onReject(item)}
                              onUnapprove={() => onUnapprove(item)}
                            />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </DesktopTable>

          <MobileCardList>
            {loading ? (
              <li className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                加载中…
              </li>
            ) : items.length === 0 ? (
              <li className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                {emptyLabel}
              </li>
            ) : (
              items.map((item) => {
                const open = expandedId === item.id;
                return (
                  <MobileCardItem key={item.id}>
                    <div className="font-medium">
                      {item.hospitalName || "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item.campaignTitle || "—"}
                    </div>
                    <div className="text-sm">
                      {item.assigneeName || item.collectorName || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.assigneeEmail}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {isPending ? (
                        <Badge variant="warning">待审核</Badge>
                      ) : (
                        <Badge variant="success">已通过</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatTime(isPending ? item.submittedAt : item.reviewedAt || item.submittedAt)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="min-h-10 w-full"
                        onClick={() => toggleExpand(item)}
                      >
                        {open ? "收起" : isPending ? "查看 / 修改" : "查看"}
                      </Button>
                      {isPending ? (
                        <Button
                          className="min-h-10 w-full"
                          disabled={actingId === item.id}
                          onClick={() => onApprove(item, open)}
                        >
                          {actingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="mr-1 h-4 w-4" />
                              通过
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          className="min-h-10 w-full"
                          disabled={actingId === item.id}
                          onClick={() => onUnapprove(item)}
                        >
                          {actingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Undo2 className="mr-1 h-4 w-4" />
                              撤销
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    {open ? (
                      <div className="rounded-md bg-muted/30 p-3">
                        <ReviewEditor
                          item={item}
                          isPending={isPending}
                          acting={actingId === item.id}
                          rejectNote={rejectNotes[item.id] || ""}
                          onRejectNoteChange={(value) =>
                            setRejectNotes((prev) => ({ ...prev, [item.id]: value }))
                          }
                          draft={drafts[item.id] || initDraft(item)}
                          onDraftChange={(update) =>
                            setDrafts((prev) => {
                              const cur = prev[item.id] || initDraft(item);
                              const next =
                                typeof update === "function" ? update(cur) : update;
                              return { ...prev, [item.id]: next };
                            })
                          }
                          error={error}
                          message={panelMessage}
                          onSave={() => onSave(item)}
                          onApprove={() => onApprove(item, true)}
                          onReject={() => onReject(item)}
                          onUnapprove={() => onUnapprove(item)}
                        />
                      </div>
                    ) : null}
                  </MobileCardItem>
                );
              })
            )}
          </MobileCardList>
        </CardContent>
      </Card>
      {confirm.dialog}
      {overwriteConfirm.dialog}
    </div>
  );
}
