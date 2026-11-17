"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  listCollectorProgress,
  type CollectorProgressCampaign,
  type CollectorProgressItem,
} from "@/lib/business";

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

type StatusCounts = {
  pendingReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  inProgressCount: number;
  openSlotCount: number;
};

/** Source hues from status.x.ai; fill is color-mix(card 80%, hue). */
const STATUS_SEGMENTS = [
  { key: "pending", label: "待审", hue: "#F3C500", count: (n: StatusCounts) => n.pendingReviewCount },
  { key: "approved", label: "已通过", hue: "#45D155", count: (n: StatusCounts) => n.approvedCount },
  { key: "rejected", label: "驳回", hue: "#FE7065", count: (n: StatusCounts) => n.rejectedCount },
  { key: "inProgress", label: "未提交", hue: "#0890FF", count: (n: StatusCounts) => n.inProgressCount },
  { key: "open", label: "可继续", hue: "#8B7AE0", count: (n: StatusCounts) => n.openSlotCount },
] as const;

const TICK_WIDTH_PX = 8;
const TICK_HEIGHT_PX = 32;
const TICK_RADIUS_PX = 48;

const collectorCardClass =
  "flex flex-col gap-2 overflow-hidden rounded-3xl p-4 bg-[#f9f8f7] dark:bg-[#1a1918] [--collector-card-bg:#f9f8f7] dark:[--collector-card-bg:#1a1918] [--collector-tick-border:#0000000f] dark:[--collector-tick-border:#ffffff1f]";

function mixedFill(hue: string) {
  return `color-mix(in srgb, var(--collector-card-bg) 80%, ${hue})`;
}

const emptyFill = "color-mix(in srgb, var(--foreground) 12%, transparent)";

const tickStyle = (background: string): CSSProperties => ({
  width: TICK_WIDTH_PX,
  height: TICK_HEIGHT_PX,
  boxSizing: "border-box",
  borderRadius: TICK_RADIUS_PX,
  flex: "none",
  border: "0.5px solid var(--collector-tick-border)",
  background,
});

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
  const reserved = active.length;
  const rest = slots - reserved;
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

function StatusTickBar({ counts }: { counts: StatusCounts }) {
  const ref = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const width = el.clientWidth;
      const gap = Number.parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap) || 1;
      const stride = TICK_WIDTH_PX + gap;
      setSlots(Math.max(1, Math.floor((width + gap) / stride)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = STATUS_SEGMENTS.map((seg) => seg.count(counts));
  const allocated = allocateSlots(values, slots);
  const total = values.reduce((sum, v) => sum + v, 0);
  const label =
    total > 0
      ? STATUS_SEGMENTS.map((seg, i) => `${seg.label} ${values[i]}`).join(" · ")
      : "暂无任务";

  const ticks: { key: string; background: string }[] = [];
  if (slots > 0 && total === 0) {
    for (let i = 0; i < slots; i += 1) {
      ticks.push({ key: `empty-${i}`, background: emptyFill });
    }
  } else {
    allocated.forEach((n, i) => {
      for (let j = 0; j < n; j += 1) {
        ticks.push({
          key: `${STATUS_SEGMENTS[i].key}-${j}`,
          background: mixedFill(STATUS_SEGMENTS[i].hue),
        });
      }
    });
  }

  return (
    <div
      ref={ref}
      className="relative flex h-10 w-full min-w-0 items-center gap-px py-1 sm:gap-0.5"
      role="img"
      aria-label={label}
      title={label}
    >
      {ticks.map((tick) => (
        <span key={tick.key} style={tickStyle(tick.background)} />
      ))}
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {STATUS_SEGMENTS.map((seg) => (
        <span key={seg.key} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-1.5 shrink-0"
            style={{
              ...tickStyle(mixedFill(seg.hue)),
              width: 6,
              height: 12,
            }}
          />
          {seg.label}
        </span>
      ))}
    </div>
  );
}

function MetricGrid({ item }: { item: StatusCounts & { assignedCount: number; submittedCount: number } }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 lg:grid-cols-7">
      <Metric label="分到" value={item.assignedCount} />
      <Metric label="已提交" value={item.submittedCount} />
      <Metric label="待审" value={item.pendingReviewCount} />
      <Metric label="已通过" value={item.approvedCount} />
      <Metric label="驳回" value={item.rejectedCount} />
      <Metric label="未提交" value={item.inProgressCount} />
      <Metric label="可继续" value={item.openSlotCount} />
    </div>
  );
}

function CollectorCard({
  item,
  open,
  onToggle,
}: {
  item: CollectorProgressItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={collectorCardClass}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <div className="font-medium">{item.name}</div>
          {item.email && item.email !== item.name ? (
            <div className="text-xs text-muted-foreground">{item.email}</div>
          ) : null}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      <StatusTickBar counts={item} />
      <MetricGrid item={item} />
      {open ? (
        <div className="space-y-3 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
          {item.campaigns.map((c: CollectorProgressCampaign) => (
            <div key={c.campaignId} className="space-y-1">
              <div className="text-sm font-medium">{c.campaignTitle}</div>
              <MetricGrid item={c} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CampaignProgressPanel({ refreshNonce }: { refreshNonce: number }) {
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

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="[--collector-card-bg:#f9f8f7] dark:[--collector-card-bg:#1a1918] [--collector-tick-border:#0000000f] dark:[--collector-tick-border:#ffffff1f]">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && items.length > 0 ? (
        <div className="space-y-2">
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
        <div className="flex flex-col gap-3">
          {items.map((it) => (
            <CollectorCard
              key={it.userId}
              item={it}
              open={!!expanded[it.userId]}
              onToggle={() => toggle(it.userId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
