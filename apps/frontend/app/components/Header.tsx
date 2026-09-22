import { Activity } from "lucide-react";

export function Header() {
  return (
    <header className="flex h-14 items-center gap-2 border-b bg-white px-4 dark:bg-zinc-950 md:h-16 md:gap-3 md:px-6">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground md:h-8 md:w-8">
          <Activity className="h-4 w-4 md:h-5 md:w-5" />
        </div>
        <span className="text-base font-bold tracking-tight md:text-lg">Mindray</span>
      </div>
      <div className="hidden h-6 w-px bg-border sm:block" />
      <span className="hidden text-sm font-medium text-muted-foreground sm:inline">
        IVD 产品应用价值平台
      </span>
    </header>
  );
}
