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
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="space-y-2 px-5 py-4 text-left">
          <DialogTitle>通过将覆盖已有客户资料</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {preview?.message || "请核对将要写入的变更后再确认通过。"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(24rem,50vh)] space-y-4 overflow-y-auto border-t px-5 py-3">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有检测到字段变更。</p>
          ) : (
            groups.map((g) => (
              <div key={g.group} className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {g.group}
                </div>
                <ul className="space-y-2">
                  {g.items.map((item, idx) => (
                    <li
                      key={`${g.group}-${item.label}-${idx}`}
                      className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <div className="font-medium">{item.label}</div>
                      <div className="mt-1 grid gap-1 text-muted-foreground">
                        <div>
                          <span className="mr-2 text-xs">旧值</span>
                          <span className="text-foreground">{item.before}</span>
                        </div>
                        <div>
                          <span className="mr-2 text-xs">新值</span>
                          <span className="text-foreground">{item.after}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
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
