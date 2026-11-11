"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApprovePreviewChange, ApproveSurveyPreview } from "@/lib/business";

export type ApproveOverwriteDialogProps = {
  open: boolean;
  preview: ApproveSurveyPreview | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
};

type DiffPart = { text: string; changed: boolean };

function groupChanges(changes: ApprovePreviewChange[]) {
  const groups: { group: string; items: ApprovePreviewChange[] }[] = [];
  const index = new Map<string, number>();
  for (const change of changes) {
    const name = change.group || "变更";
    let i = index.get(name);
    if (i == null) {
      i = groups.length;
      index.set(name, i);
      groups.push({ group: name, items: [] });
    }
    groups[i].items.push(change);
  }
  return groups;
}

/** Split into words, whitespace, CJK characters and punctuation for a small LCS diff. */
function tokenize(value: string): string[] {
  return (
    value.match(
      /\s+|[A-Za-z0-9_+.-]+|[\u3400-\u9fff]|[^\sA-Za-z0-9_\u3400-\u9fff.-]/g,
    ) || (value ? [value] : [])
  );
}

function mergeParts(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (last && last.changed === part.changed) {
      last.text += part.text;
    } else {
      out.push({ ...part });
    }
  }
  return out;
}

function diffParts(
  before: string,
  after: string,
): { left: DiffPart[]; right: DiffPart[] } {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const left: DiffPart[] = [];
  const right: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      left.push({ text: a[i], changed: false });
      right.push({ text: b[j], changed: false });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      left.push({ text: a[i], changed: true });
      i += 1;
    } else {
      right.push({ text: b[j], changed: true });
      j += 1;
    }
  }
  while (i < n) {
    left.push({ text: a[i], changed: true });
    i += 1;
  }
  while (j < m) {
    right.push({ text: b[j], changed: true });
    j += 1;
  }
  return { left: mergeParts(left), right: mergeParts(right) };
}

function DiffText({
  parts,
  side,
}: {
  parts: DiffPart[];
  side: "left" | "right";
}) {
  const markClass =
    side === "left"
      ? "rounded-sm bg-[#ffcecb] text-[#82071e]"
      : "rounded-sm bg-[#aceebb] text-[#0a5c24]";
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, idx) =>
        part.changed ? (
          <mark key={idx} className={markClass}>
            {part.text}
          </mark>
        ) : (
          <span key={idx}>{part.text}</span>
        ),
      )}
    </span>
  );
}

function FieldBlock({
  item,
  side,
}: {
  item: ApprovePreviewChange;
  side: "left" | "right";
}) {
  const parts = diffParts(item.before, item.after);
  return (
    <div
      className={
        side === "left"
          ? "border-b border-[#ffcecb] bg-[#ffebe9] px-3 py-2 last:border-b-0"
          : "border-b border-[#aceebb] bg-[#dafbe1] px-3 py-2 last:border-b-0"
      }
    >
      <div className="text-xs font-medium text-neutral-600">{item.label}</div>
      <div className="mt-0.5 text-sm leading-relaxed text-neutral-900">
        <DiffText parts={side === "left" ? parts.left : parts.right} side={side} />
      </div>
    </div>
  );
}

function DiffCard({
  title,
  side,
  groups,
}: {
  title: string;
  side: "left" | "right";
  groups: { group: string; items: ApprovePreviewChange[] }[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium">
        {title}
      </div>
      {groups.map((g) => (
        <div key={`${side}-${g.group}`}>
          <div className="border-b bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {g.group}
          </div>
          {g.items.map((item, idx) => (
            <FieldBlock
              key={`${side}-${g.group}-${item.label}-${idx}`}
              item={item}
              side={side}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function AlignedSplit({
  groups,
}: {
  groups: { group: string; items: ApprovePreviewChange[] }[];
}) {
  const lastGroup = groups[groups.length - 1];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-0">
      <div className="rounded-t-xl border border-b bg-muted/50 px-3 py-2 text-sm font-medium shadow-sm">
        现有客户资料
      </div>
      <div className="rounded-t-xl border border-b bg-muted/50 px-3 py-2 text-sm font-medium shadow-sm">
        本次答卷将要写入
      </div>
      {groups.map((g) => (
        <React.Fragment key={g.group}>
          <div className="border-x border-b bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {g.group}
          </div>
          <div className="border-x border-b bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {g.group}
          </div>
          {g.items.map((item, idx) => {
            const isLast = g === lastGroup && idx === g.items.length - 1;
            const parts = diffParts(item.before, item.after);
            return (
              <React.Fragment key={`${g.group}-${item.label}-${idx}`}>
                <div
                  className={`border-x bg-[#ffebe9] px-3 py-2 ${
                    isLast ? "rounded-b-xl border-b" : "border-b border-[#ffcecb]"
                  }`}
                >
                  <div className="text-xs font-medium text-neutral-600">
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-sm leading-relaxed text-neutral-900">
                    <DiffText parts={parts.left} side="left" />
                  </div>
                </div>
                <div
                  className={`border-x bg-[#dafbe1] px-3 py-2 ${
                    isLast ? "rounded-b-xl border-b" : "border-b border-[#aceebb]"
                  }`}
                >
                  <div className="text-xs font-medium text-neutral-600">
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-sm leading-relaxed text-neutral-900">
                    <DiffText parts={parts.right} side="right" />
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

/** 覆盖已有客户资料时的字段对照确认框（替代 window.confirm） */
export function ApproveOverwriteDialog({
  open,
  preview,
  busy = false,
  onOpenChange,
  onConfirm,
}: ApproveOverwriteDialogProps) {
  const [internalBusy, setInternalBusy] = React.useState(false);
  const pending = busy || internalBusy;
  const groups = groupChanges(preview?.changes || []);

  const handleConfirm = async () => {
    setInternalBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setInternalBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (pending) return;
        onOpenChange(v);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl md:max-w-5xl"
      >
        <DialogHeader className="space-y-2 px-5 py-4 text-left">
          <DialogTitle>通过将覆盖已有客户资料</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {preview?.message || "请核对将要写入的变更后再确认通过。"}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto border-t px-5 py-4">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有检测到字段变更。</p>
          ) : (
            <>
              <div className="flex flex-col gap-3 md:hidden">
                <DiffCard title="现有客户资料" side="left" groups={groups} />
                <DiffCard
                  title="本次答卷将要写入"
                  side="right"
                  groups={groups}
                />
              </div>
              <div className="hidden md:block">
                <AlignedSplit groups={groups} />
              </div>
            </>
          )}
        </div>
        <DialogFooter className="border-t bg-muted/30 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void handleConfirm()}
          >
            {pending ? "处理中…" : "确认覆盖并通过"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useApproveOverwriteDialog() {
  const pendingRef = React.useRef<{
    preview: ApproveSurveyPreview;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const [pending, setPending] = React.useState<{
    preview: ApproveSurveyPreview;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const ask = React.useCallback((preview: ApproveSurveyPreview) => {
    return new Promise<boolean>((resolve) => {
      const next = { preview, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const settle = React.useCallback((ok: boolean) => {
    const cur = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    cur?.resolve(ok);
  }, []);

  const dialog = (
    <ApproveOverwriteDialog
      open={!!pending}
      preview={pending?.preview || null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      onConfirm={async () => {
        settle(true);
      }}
    />
  );

  return { ask, dialog };
}
