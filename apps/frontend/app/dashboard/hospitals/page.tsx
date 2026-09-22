"use client";

import { Hospital } from "lucide-react";

export default function HospitalsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <Hospital className="h-16 w-16 text-muted-foreground" />
      <h2 className="text-xl font-semibold text-muted-foreground">医院管理</h2>
      <p className="text-sm text-muted-foreground">此功能正在开发中，敬请期待。</p>
    </div>
  );
}
