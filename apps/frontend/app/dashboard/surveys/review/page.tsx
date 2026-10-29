"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Inbox, Loader2, RefreshCw, X } from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  approveSurveySubmission,
  listSurveySubmissions,
  rejectSurveySubmission,
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
import { SurveyAnswersView } from "@/components/survey-answers-view";

type ReviewTab = "pending" | "approved";

export default function SurveyReviewPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<ReviewTab>("pending");
  const [items, setItems] = useState<SurveySubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
  }, [tab]);

  const onApprove = async (id: string) => {
    setActingId(id);
    setError(null);
    const res = await approveSurveySubmission(id);
    setActingId(null);
    if (res.error) setError(res.error);
    else await load();
  };

  const onReject = async (id: string) => {
    const note = (rejectNotes[id] || "").trim();
    if (!note) {
      setError("驳回请填写原因");
      return;
    }
    setActingId(id);
    setError(null);
    const res = await rejectSurveySubmission(id, note);
    setActingId(null);
    if (res.error) setError(res.error);
    else await load();
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
                    ? `审核采集员提交的问卷。待审 ${total} 份。`
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
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
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
                              onClick={() =>
                                setExpandedId((cur) => (cur === item.id ? null : item.id))
                              }
                            >
                              {expandedId === item.id ? "收起" : "查看"}
                            </Button>
                            {isPending ? (
                              <Button
                                size="sm"
                                disabled={actingId === item.id}
                                onClick={() => onApprove(item.id)}
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
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedId === item.id ? (
                        <TableRow>
                          <TableCell colSpan={isPending ? 6 : 7} className="bg-muted/30">
                            <div className="mb-3 border-b border-border/60 pb-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">客户：</span>
                                <span className="font-medium">{item.hospitalName || "—"}</span>
                              </div>
                              {item.campaignTitle ? (
                                <div className="mt-1 text-muted-foreground">
                                  发放：{item.campaignTitle}
                                </div>
                              ) : null}
                            </div>
                            <SurveyAnswersView
                              answers={item.answers || {}}
                              fields={item.schema?.fields}
                              sections={item.schema?.sections}
                            />
                            {isPending ? (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Input
                                  className="max-w-md"
                                  placeholder="驳回原因（必填）"
                                  value={rejectNotes[item.id] || ""}
                                  onChange={(e) =>
                                    setRejectNotes((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                />
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={actingId === item.id}
                                  onClick={() => onReject(item.id)}
                                >
                                  <X className="mr-1 h-4 w-4" />
                                  驳回
                                </Button>
                              </div>
                            ) : item.reviewNote ? (
                              <p className="mt-3 text-sm text-muted-foreground">
                                审核备注：{item.reviewNote}
                              </p>
                            ) : null}
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
                    <div className={`grid gap-2 ${isPending ? "grid-cols-2" : "grid-cols-1"}`}>
                      <Button
                        variant="outline"
                        className="min-h-10 w-full"
                        onClick={() =>
                          setExpandedId((cur) => (cur === item.id ? null : item.id))
                        }
                      >
                        {open ? "收起" : "查看"}
                      </Button>
                      {isPending ? (
                        <Button
                          className="min-h-10 w-full"
                          disabled={actingId === item.id}
                          onClick={() => onApprove(item.id)}
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
                      ) : null}
                    </div>
                    {open ? (
                      <div className="space-y-3 rounded-md bg-muted/30 p-3">
                        <div className="border-b border-border/60 pb-2 text-sm">
                          <span className="text-muted-foreground">客户：</span>
                          <span className="font-medium">{item.hospitalName || "—"}</span>
                        </div>
                        <SurveyAnswersView
                          answers={item.answers || {}}
                          fields={item.schema?.fields}
                          sections={item.schema?.sections}
                          className="grid gap-2 text-sm"
                        />
                        {isPending ? (
                          <>
                            <Input
                              className="w-full"
                              placeholder="驳回原因（必填）"
                              value={rejectNotes[item.id] || ""}
                              onChange={(e) =>
                                setRejectNotes((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                            />
                            <Button
                              variant="destructive"
                              className="min-h-10 w-full"
                              disabled={actingId === item.id}
                              onClick={() => onReject(item.id)}
                            >
                              <X className="mr-1 h-4 w-4" />
                              驳回
                            </Button>
                          </>
                        ) : item.reviewNote ? (
                          <p className="text-sm text-muted-foreground">
                            审核备注：{item.reviewNote}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </MobileCardItem>
                );
              })
            )}
          </MobileCardList>
        </CardContent>
      </Card>
    </div>
  );
}
