"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Hospital } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HospitalPanelProps {
  hospitals: Hospital[];
  selectedProvince?: string;
}

const PAGE_SIZE = 10;

const statusConfig: Record<
  Hospital["status"],
  { label: string; variant: "success" | "warning" | "secondary" }
> = {
  active: { label: "运营中", variant: "success" },
  pending: { label: "待确认", variant: "warning" },
  inactive: { label: "未激活", variant: "secondary" },
};

export function HospitalPanel({ hospitals, selectedProvince }: HospitalPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // 筛选条件变化后重置到第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [hospitals, selectedProvince]);

  const filtered = useMemo(() => {
    const lower = searchQuery.trim().toLowerCase();
    if (!lower) return hospitals;
    return hospitals.filter(
      (h) =>
        h.name.toLowerCase().includes(lower) ||
        h.province.toLowerCase().includes(lower) ||
        h.city.toLowerCase().includes(lower)
    );
  }, [hospitals, searchQuery]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const pageData = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">医院清单</h2>
          <Badge variant="secondary" className="text-xs">
            {filtered.length} 家
          </Badge>
        </div>
        {selectedProvince && (
          <Badge variant="outline" className="text-xs">
            {selectedProvince}
          </Badge>
        )}
      </div>

      {/* Search & Action */}
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索医院名称、省市"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
        <Button size="sm" variant="default" className="shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">案例维护</span>
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table className="min-w-[480px]">
          <TableHeader className="sticky top-0 z-10 bg-white dark:bg-zinc-950">
            <TableRow className="border-b">
              <TableHead className="w-16">省/市</TableHead>
              <TableHead className="w-16">区/市</TableHead>
              <TableHead>医院名称</TableHead>
              <TableHead className="w-20">级别</TableHead>
              <TableHead className="w-20">设备数</TableHead>
              <TableHead className="w-20">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  暂无匹配的医院数据
                </TableCell>
              </TableRow>
            ) : (
              pageData.map((hospital) => (
                <TableRow key={hospital.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="truncate text-xs text-muted-foreground">
                    {hospital.province}
                  </TableCell>
                  <TableCell className="truncate text-xs text-muted-foreground">
                    {hospital.city}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {hospital.name}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {hospital.level}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="font-medium text-primary">
                      {hospital.deviceCount}
                    </span>
                    <span className="text-muted-foreground"> 台</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={statusConfig[hospital.status].variant}
                      className="text-[10px]"
                    >
                      {statusConfig[hospital.status].label}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t px-4 py-2">
        <span className="text-xs text-muted-foreground">
          共 {filtered.length} 条，第 {safePage}/{totalPages} 页
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(safePage - 1)}
            className="h-7 px-2 text-xs"
          >
            上一页
          </Button>
          {/* 桌面端显示完整页码 */}
          <div className="hidden items-center gap-1 sm:flex">
            {generatePageNumbers(safePage, totalPages).map((page, idx) =>
              page === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page as number)}
                  className={cn(
                    "h-7 min-w-7 rounded-md px-2 text-xs transition-colors",
                    page === safePage
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  {page}
                </button>
              )
            )}
          </div>
          {/* 移动端只显示当前页 */}
          <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-primary px-2 text-xs text-primary-foreground sm:hidden">
            {safePage}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(safePage + 1)}
            className="h-7 px-2 text-xs"
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}
