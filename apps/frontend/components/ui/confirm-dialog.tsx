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

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作：确认按钮用 destructive 样式 */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
};

/** 居中 shadcn Dialog 风格确认卡片（替代 window.confirm） */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  destructive = true,
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [internalBusy, setInternalBusy] = React.useState(false);
  const pending = busy || internalBusy;

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
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="space-y-2 px-5 py-4 text-left">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="whitespace-pre-line text-sm leading-relaxed">
              {description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="border-t bg-muted/30 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => void handleConfirm()}
          >
            {pending ? "处理中…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ConfirmAskOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingAsk = ConfirmAskOptions & {
  resolve: (ok: boolean) => void;
};

/**
 * Promise 版确认：`if (!(await confirm.ask({...}))) return;`
 * 记得在 JSX 里渲染 `{confirm.dialog}`。
 */
export function useConfirmDialog() {
  const pendingRef = React.useRef<PendingAsk | null>(null);
  const [pending, setPending] = React.useState<PendingAsk | null>(null);

  const ask = React.useCallback((opts: ConfirmAskOptions) => {
    return new Promise<boolean>((resolve) => {
      const next = { ...opts, resolve };
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
    <ConfirmDialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      title={pending?.title || ""}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      destructive={pending?.destructive ?? true}
      onConfirm={async () => {
        settle(true);
      }}
    />
  );

  return { ask, dialog };
}
