"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  listCollectorProgress,
  type CollectorProgressItem,
} from "@/lib/business";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  PageToolbar,
} from "@/components/mobile-data-list";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function Num({ value }: { value: number }) {
  return <span className="font-mono tabular-nums">{value}</span>;
}

export default function SurveyCampaignProgressPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<CollectorProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listCollectorProgress();
    setLoading(false);
    if (res.error) {
      setError(res.error);
      setItems([]);
      return;
    }
    setItems(res.items);
    setExpanded((prev) => {
      const next: Record<string, boolean> = {};
      for (const it of res.items) {
        next[it.userId] = prev[it.userId] ?? false;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    void load();
  }, [user, load]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, it) => {
        acc.assigned += it.assignedCount;
        acc.submitted += it.submittedCount;
        acc.pending += it.pendingReviewCount;
        acc.approved += it.approvedCount;
        acc.rejected += it.rejectedCount;
        acc.inProgress += it.inProgressCount;
        acc.open += it.openSlotCount;
        return acc;
      },
      {
        assigned: 0,
        submitted: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        inProgress: 0,
        open: 0,
      },
    );
  }, [items]);

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card className="border-none shadow-none">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>问卷发放 · 进度</CardTitle>
                <CardDescription>
                  按采集员查看收集进度。分到 / 未提交不含「自选医院」提交后自动生成的空闲任务；该项单独记为「可继续」。当前共 {items.length} 位采集员。
                </CardDescription>
              </div>
            </div>
            <PageToolbar>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </PageToolbar>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!loading && items.length > 0 ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span>
                分到 <Num value={totals.assigned} />
              </span>
              <span>
                已提交 <Num value={totals.submitted} />
              </span>
              <span>
                待审 <Num value={totals.pending} />
              </span>
              <span>
                已通过 <Num value={totals.approved} />
              </span>
              <span>
                驳回 <Num value={totals.rejected} />
              </span>
              <span>
                未提交 <Num value={totals.inProgress} />
              </span>
              <span>
                可继续 <Num value={totals.open} />
              </span>
            </div>
          ) : null}

          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>采集员</TableHead>
                  <TableHead className="text-right">分到</TableHead>
                  <TableHead className="text-right">已提交</TableHead>
                  <TableHead className="text-right">待审</TableHead>
                  <TableHead className="text-right">已通过</TableHead>
                  <TableHead className="text-right">驳回</TableHead>
                  <TableHead className="text-right">未提交</TableHead>
                  <TableHead className="text-right">可继续</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground">
                      暂无采集任务
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => {
                    const open = !!expanded[it.userId];
                    return (
                      <Fragment key={it.userId}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => toggle(it.userId)}
                        >
                          <TableCell className="w-8 px-2">
                            {open ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{it.name}</div>
                            {it.email && it.email !== it.name ? (
                              <div className="text-xs text-muted-foreground">
                                {it.email}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {it.assignedCount}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {it.submittedCount}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {it.pendingReviewCount}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {it.approvedCount}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {it.rejectedCount}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {it.inProgressCount}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {it.openSlotCount}
                          </TableCell>
                        </TableRow>
                        {open
                          ? it.campaigns.map((c) => (
                              <TableRow
                                key={`${it.userId}-${c.campaignId}`}
                                className="bg-muted/40"
                              >
                                <TableCell />
                                <TableCell className="pl-6 text-sm">
                                  {c.campaignTitle}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums">
                                  {c.assignedCount}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums">
                                  {c.submittedCount}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums">
                                  {c.pendingReviewCount}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums">
                                  {c.approvedCount}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums">
                                  {c.rejectedCount}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums">
                                  {c.inProgressCount}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums">
                                  {c.openSlotCount}
                                </TableCell>
                              </TableRow>
                            ))
                          : null}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </DesktopTable>

          <MobileCardList>
            {loading ? (
              <p className="px-1 text-sm text-muted-foreground">加载中…</p>
            ) : items.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">暂无采集任务</p>
            ) : (
              items.map((it) => {
                const open = !!expanded[it.userId];
                return (
                  <MobileCardItem key={it.userId}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 text-left"
                      onClick={() => toggle(it.userId)}
                    >
                      <div>
                        <div className="font-medium">{it.name}</div>
                        {it.email && it.email !== it.name ? (
                          <div className="text-xs text-muted-foreground">
                            {it.email}
                          </div>
                        ) : null}
                      </div>
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <Metric label="分到" value={it.assignedCount} />
                      <Metric label="已提交" value={it.submittedCount} />
                      <Metric label="待审" value={it.pendingReviewCount} />
                      <Metric label="已通过" value={it.approvedCount} />
                      <Metric label="驳回" value={it.rejectedCount} />
                      <Metric label="未提交" value={it.inProgressCount} />
                      <Metric label="可继续" value={it.openSlotCount} />
                    </div>
                    {open ? (
                      <div className="space-y-3 border-t pt-3">
                        {it.campaigns.map((c) => (
                          <div key={c.campaignId} className="space-y-1">
                            <div className="text-sm font-medium">{c.campaignTitle}</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <Metric label="分到" value={c.assignedCount} />
                              <Metric label="已提交" value={c.submittedCount} />
                              <Metric label="待审" value={c.pendingReviewCount} />
                              <Metric label="已通过" value={c.approvedCount} />
                              <Metric label="驳回" value={c.rejectedCount} />
                              <Metric label="未提交" value={c.inProgressCount} />
                              <Metric label="可继续" value={c.openSlotCount} />
                            </div>
                          </div>
                        ))}
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
