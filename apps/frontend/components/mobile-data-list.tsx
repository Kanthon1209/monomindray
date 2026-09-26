import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** 桌面端表格容器：手机隐藏，避免横向挤爆 */
export function DesktopTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hidden overflow-x-auto rounded-lg border md:block",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 手机端卡片列表容器：桌面隐藏 */
export function MobileCardList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y rounded-lg border md:hidden", className)}>
      {children}
    </ul>
  );
}

export function MobileCardItem({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <li>
      <Comp
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn(
          "flex w-full flex-col gap-2 px-3 py-3.5 text-left",
          onClick && "active:bg-accent",
          className,
        )}
      >
        {children}
      </Comp>
    </li>
  );
}

export function ListEmptyState({
  loading,
  empty,
  colSpan,
}: {
  loading: boolean;
  empty: boolean;
  colSpan: number;
}) {
  if (loading) {
    return (
      <>
        <tr className="hidden md:table-row">
          <td colSpan={colSpan} className="h-24 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </td>
        </tr>
        <li className="flex h-24 items-center justify-center md:hidden">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </li>
      </>
    );
  }
  if (empty) {
    return (
      <>
        <tr className="hidden md:table-row">
          <td
            colSpan={colSpan}
            className="h-24 text-center text-muted-foreground"
          >
            暂无数据
          </td>
        </tr>
        <li className="flex h-24 items-center justify-center text-sm text-muted-foreground md:hidden">
          暂无数据
        </li>
      </>
    );
  }
  return null;
}

export function PageToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}
