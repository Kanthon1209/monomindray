"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listCollectorProgress,
  type CollectorProgressCampaign,
  type CollectorProgressItem,
} from "@/lib/business";

const TICK_COUNT = 90;
const TICK_HEIGHT_PX = 32;
const TICK_RADIUS_PX = 48;
const HOVER_SCALE_X = 1.2;
const HOVER_SCALE_Y = 1.25;
const HOVER_NEIGHBOR_X = 0.5;
const HOVER_NEIGHBOR_Y = 1 / 3;

type StatusCounts = {
  pendingReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  inProgressCount: number;
  openSlotCount: number;
};

const STATUS_SEGMENTS = [
  { key: "pending", label: "待审", hue: "#F3C500", count: (n: StatusCounts) => n.pendingReviewCount },
  { key: "approved", label: "已通过", hue: "#45D155", count: (n: StatusCounts) => n.approvedCount },
  { key: "rejected", label: "驳回", hue: "#FE7065", count: (n: StatusCounts) => n.rejectedCount },
  { key: "inProgress", label: "未提交", hue: "#0890FF", count: (n: StatusCounts) => n.inProgressCount },
  { key: "open", label: "可继续", hue: "#8B7AE0", count: (n: StatusCounts) => n.openSlotCount },
] as const;

const mixedFill = (hue: string) =>
  `color-mix(in srgb, var(--status-card) 80%, ${hue})`;

/** Equivalent of hsl(foreground / 0.12); our --foreground is a hex token. */
const EMPTY_FILL = "color-mix(in srgb, var(--foreground) 12%, transparent)";

const PANEL_VARS =
  "[--status-card:#f9f8f7] dark:[--status-card:#1c1c1c] [--status-bar-hairline:#0000000f] dark:[--status-bar-hairline:#ffffff1f]";

const COLLECTOR_CARD_CLASS =
  "bg-[var(--status-card)] hover:bg-black/[0.03] dark:hover:bg-white/[0.06] flex min-w-0 flex-col gap-2 overflow-hidden rounded-3xl p-4";

type TickModel = {
  i: number;
  background: string;
  label: string;
  count: number;
  empty: boolean;
};

/** Largest-remainder allocation; any non-zero status gets at least one tick when slots allow. */
function allocateSlots(values: number[], slots: number): number[] {
  const out = values.map(() => 0);
  if (slots <= 0) return out;
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return out;
  const active = values
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v > 0);
  if (slots < active.length) {
    active
      .sort((a, b) => b.v - a.v || a.i - b.i)
      .slice(0, slots)
      .forEach((x) => {
        out[x.i] = 1;
      });
    return out;
  }
  const rest = slots - active.length;
  const raw = values.map((v) => (v / total) * rest);
  const extra = raw.map((r, i) => (values[i] > 0 ? Math.floor(r) : 0));
  let used = extra.reduce((sum, n) => sum + n, 0);
  const frac = values
    .map((v, i) => ({ i, f: v > 0 ? raw[i] - Math.floor(raw[i]) : -1 }))
    .filter((x) => x.f >= 0)
    .sort((a, b) => b.f - a.f || a.i - b.i);
  let k = 0;
  while (used < rest && k < frac.length) {
    extra[frac[k].i] += 1;
    used += 1;
    k += 1;
  }
  return values.map((v, i) => (v > 0 ? 1 + extra[i] : 0));
}

function buildTicks(counts: StatusCounts): TickModel[] {
  const values = STATUS_SEGMENTS.map((seg) => seg.count(counts));
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return Array.from({ length: TICK_COUNT }, (_, i) => ({
      i,
      background: EMPTY_FILL,
      label: "暂无任务",
      count: 0,
      empty: true,
    }));
  }
  const allocated = allocateSlots(values, TICK_COUNT);
  const ticks: TickModel[] = [];
  allocated.forEach((n, segIndex) => {
    const seg = STATUS_SEGMENTS[segIndex];
    const background = mixedFill(seg.hue);
    for (let j = 0; j < n; j += 1) {
      ticks.push({
        i: ticks.length,
        background,
        label: seg.label,
        count: values[segIndex],
        empty: false,
      });
    }
  });
  return ticks;
}

function hoverScale(distance: number | null): { sx: number; sy: number; z: number } {
  if (distance === null || distance > 1) return { sx: 1, sy: 1, z: 0 };
  if (distance === 0) return { sx: HOVER_SCALE_X, sy: HOVER_SCALE_Y, z: 2 };
  return {
    sx: 1 + (HOVER_SCALE_X - 1) * HOVER_NEIGHBOR_X,
    sy: 1 + (HOVER_SCALE_Y - 1) * HOVER_NEIGHBOR_Y,
    z: 1,
  };
}

function TickHoverCard({
  x,
  y,
  label,
  count,
  empty,
}: {
  x: number;
  y: number;
  label: string;
  count: number;
  empty: boolean;
}) {
  return createPortal(
    <div
      className="pointer-events-none fixed z-[80]"
      style={{ left: x, top: y, transform: "translate(-50%, calc(-100% - 8px))" }}
    >
      <div className="flex w-max flex-col gap-1 rounded-2xl border border-black/5 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-[#2a2a2a]">
        <div className="text-[15px] leading-5 font-semibold">{label}</div>
        <div className="text-sm leading-5 font-medium text-muted-foreground">
          {empty ? "暂无任务" : `${count} 份`}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const StatusTickBar = memo(function StatusTickBar({
  counts,
  ariaLabel,
}: {
  counts: StatusCounts;
  ariaLabel?: string;
}) {
  const ticks = useMemo(() => buildTicks(counts), [
    counts.pendingReviewCount,
    counts.approvedCount,
    counts.rejectedCount,
    counts.inProgressCount,
    counts.openSlotCount,
  ]);
  const [hover, setHover] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);

  const onEnter = useCallback((index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover({ index, x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  const onLeave = useCallback(() => setHover(null), []);

  const hovered = hover ? ticks[hover.index] : undefined;

  return (
    <div className="w-full min-w-0" role="grid" aria-label={ariaLabel}>
      <div className="relative flex h-10 w-full min-w-0 items-center gap-px py-1 sm:gap-0.5">
        {ticks.map((tick) => {
          const dist = hover ? Math.abs(tick.i - hover.index) : null;
          const { sx, sy, z } = hoverScale(dist);
          return (
            <button
              key={tick.i}
              type="button"
              className="relative flex h-full min-w-0 flex-1 cursor-default items-center p-0"
              style={{ zIndex: z }}
              aria-label={tick.empty ? tick.label : `${tick.label} ${tick.count} 份`}
              onPointerEnter={(event) => onEnter(tick.i, event)}
              onPointerLeave={onLeave}
            >
              <span
                className="pointer-events-none block w-full origin-center transition-transform duration-150 ease-out motion-reduce:transition-none"
                style={{
                  boxSizing: "border-box",
                  width: "100%",
                  height: TICK_HEIGHT_PX,
                  border: "0.5px solid var(--status-bar-hairline)",
                  borderRadius: TICK_RADIUS_PX,
                  flex: "none",
                  background: tick.background,
                  transform: `scale(${sx}, ${sy})`,
                }}
              />
            </button>
          );
        })}
      </div>
      {hover && hovered
        ? (
          <TickHoverCard
            x={hover.x}
            y={hover.y}
            label={hovered.label}
            count={hovered.count}
            empty={hovered.empty}
          />
        )
        : null}
    </div>
  );
});

const StatusLegend = memo(function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {STATUS_SEGMENTS.map((seg) => (
        <span key={seg.key} className="inline-flex items-center gap-1.5">
          <span
            className="shrink-0"
            style={{
              width: 6,
              height: 12,
              boxSizing: "border-box",
              borderRadius: TICK_RADIUS_PX,
              border: "0.5px solid var(--status-bar-hairline)",
              background: mixedFill(seg.hue),
            }}
          />
          {seg.label}
        </span>
      ))}
    </div>
  );
});

function Num({ value }: { value: number }) {
  return <span className="font-mono tabular-nums">{value}</span>;
}

function collectorCampaignProgressStatus(campaign: CollectorProgressCampaign) {
  if (campaign.campaignStatus === "closed") return "closed";
  if (campaign.campaignStatus === "draft") return "draft";
  const pending = campaign.pendingReviewCount ?? 0;
  const approved = campaign.approvedCount ?? 0;
  const rejected = campaign.rejectedCount ?? 0;
  if (pending > 0) return "pending_review";
  const unfinished =
    (campaign.assignedCount ?? 0) - approved - rejected - pending;
  if (unfinished <= 0 && approved > 0) return "approved";
  if (unfinished <= 0 && rejected > 0) return "rejected";
  return "active";
}

function collectorCampaignStatusBadge(campaign: CollectorProgressCampaign) {
  switch (collectorCampaignProgressStatus(campaign)) {
    case "pending_review":
      return <Badge variant="warning">待审核</Badge>;
    case "approved":
      return <Badge variant="success">已通过</Badge>;
    case "rejected":
      return <Badge variant="destructive">已驳回</Badge>;
    case "closed":
      return <Badge variant="outline">已关闭</Badge>;
    case "draft":
      return <Badge variant="secondary">草稿</Badge>;
    case "active":
      return <Badge variant="secondary">进行中</Badge>;
    default:
      return (
        <Badge variant="secondary">{campaign.campaignStatus || "进行中"}</Badge>
      );
  }
}

const CollectorCard = memo(function CollectorCard({
  item,
  onOpen,
}: {
  item: CollectorProgressItem;
  onOpen: (item: CollectorProgressItem) => void;
}) {
  const ariaLabel = `${item.name} 收集进度`;
  const openDialog = () => onOpen(item);
  return (
    <div
      className={`${COLLECTOR_CARD_CLASS} cursor-pointer`}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`${item.name} 的问卷状态`}
      onClick={openDialog}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDialog();
        }
      }}
    >
      <div className="min-w-0">
        <div className="truncate text-[15px] leading-5 font-semibold">{item.name}</div>
        {item.email && item.email !== item.name ? (
          <div className="truncate text-xs text-muted-foreground">{item.email}</div>
        ) : null}
      </div>
      <div
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <StatusTickBar counts={item} ariaLabel={ariaLabel} />
      </div>
    </div>
  );
});

const CollectorCampaignDialog = memo(function CollectorCampaignDialog({
  item,
  onOpenChange,
}: {
  item: CollectorProgressItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent
        className={`gap-4 p-5 sm:max-w-xl ${PANEL_VARS}`}
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{item?.name ?? "采集员"}</DialogTitle>
          <DialogDescription>
            {item?.email && item.email !== item.name ? `${item.email} · ` : ""}
            负责的问卷及状态
          </DialogDescription>
        </DialogHeader>
        {item && item.campaigns.length > 0 ? (
          <div className="space-y-3">
            {item.campaigns.map((campaign) => (
              <div
                key={campaign.campaignId}
                className="space-y-2 rounded-2xl bg-[var(--status-card)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 truncate text-sm font-medium">
                    {campaign.campaignTitle}
                  </div>
                  <div className="shrink-0">{collectorCampaignStatusBadge(campaign)}</div>
                </div>
                <StatusTickBar
                  counts={campaign}
                  ariaLabel={`${campaign.campaignTitle} 进度`}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无负责的问卷</p>
        )}
      </DialogContent>
    </Dialog>
  );
});

export function CampaignProgressPanel({ refreshNonce }: { refreshNonce: number }) {
  const [items, setItems] = useState<CollectorProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CollectorProgressItem | null>(null);

  const load = useCallback(async () => {
    const res = await listCollectorProgress();
    if (res.error) {
      setError(res.error);
      setItems([]);
      setSelected(null);
      setLoading(false);
      return;
    }
    setError(null);
    setItems(res.items);
    setSelected((prev) =>
      prev ? (res.items.find((it) => it.userId === prev.userId) ?? null) : null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

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

  const onOpen = useCallback((item: CollectorProgressItem) => {
    setSelected(item);
  }, []);

  const onDialogOpenChange = useCallback((open: boolean) => {
    if (!open) setSelected(null);
  }, []);

  return (
    <div className={`p-4 ${PANEL_VARS}`}>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && items.length > 0 ? (
        <div className="mb-4 space-y-2">
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
          <StatusLegend />
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无采集任务</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <CollectorCard
              key={it.userId}
              item={it}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      <CollectorCampaignDialog item={selected} onOpenChange={onDialogOpenChange} />
    </div>
  );
}
