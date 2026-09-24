"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Search, ClipboardList, Columns2, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HospitalDetailSheet } from "./HospitalDetailSheet";
import type { Hospital } from "@/lib/types";
import {
  DASHBOARD_EXTRA_COLUMNS,
  DASHBOARD_PRIMARY_COLUMNS,
  archiveFieldLabel,
  displayValue,
  formatMatchingRate,
  parseNumericField,
  resolveArchiveField,
  type ArchiveFieldKey,
} from "@/lib/hospital-archive";
import { cn } from "@/lib/utils";

interface HospitalPanelProps {
  hospitals: Hospital[];
  selectedProvince?: string;
  modelFilter?: string;
  levelFilter?: string;
}

export function HospitalPanel({
  hospitals,
  selectedProvince,
  modelFilter = "all",
  levelFilter = "all",
}: HospitalPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedCols, setExpandedCols] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const columns = useMemo(
    () =>
      expandedCols
        ? [...DASHBOARD_PRIMARY_COLUMNS, ...DASHBOARD_EXTRA_COLUMNS]
        : DASHBOARD_PRIMARY_COLUMNS,
    [expandedCols],
  );

  const filtered = useMemo(() => {
    const lower = searchQuery.trim().toLowerCase();
    return hospitals.filter((h) => {
      const customerName = resolveArchiveField(h, "customerName");
      const model = resolveArchiveField(h, "model");
      const level = resolveArchiveField(h, "customerLevel");
      if (modelFilter !== "all" && model !== modelFilter) return false;
      if (levelFilter !== "all" && level !== levelFilter) return false;
      if (!lower) return true;
      return (
        customerName.toLowerCase().includes(lower) ||
        h.name.toLowerCase().includes(lower) ||
        h.city.toLowerCase().includes(lower) ||
        model.toLowerCase().includes(lower) ||
        resolveArchiveField(h, "branchOffice").toLowerCase().includes(lower)
      );
    });
  }, [hospitals, searchQuery, modelFilter, levelFilter]);

  useEffect(() => {
    if (selectedId && !filtered.some((h) => h.id === selectedId)) {
      setSelectedId(null);
      setDetailOpen(false);
    }
  }, [filtered, selectedId]);

  const summary = useMemo(() => {
    let withModel = 0;
    let rateSum = 0;
    let rateCount = 0;
    let mindraySamples = 0;
    for (const h of filtered) {
      if (resolveArchiveField(h, "model")) withModel += 1;
      const rate = parseNumericField(resolveArchiveField(h, "matchingRate"));
      if (rate != null) {
        rateSum += rate <= 1 ? rate * 100 : rate;
        rateCount += 1;
      }
      const ms = parseNumericField(resolveArchiveField(h, "mindraySampleVolume"));
      if (ms != null) mindraySamples += ms;
    }
    return {
      total: filtered.length,
      withModel,
      avgRate: rateCount ? `${(rateSum / rateCount).toFixed(1)}%` : "—",
      mindraySamples: mindraySamples
        ? Math.round(mindraySamples).toLocaleString()
        : "—",
    };
  }, [filtered]);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  const cellValue = (h: Hospital, key: ArchiveFieldKey) => {
    const raw = resolveArchiveField(h, key);
    if (key === "matchingRate") return formatMatchingRate(raw);
    return displayValue(raw);
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-l bg-background">
      <div className="shrink-0 space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight">
                医院列表
              </h2>
              <Badge variant="secondary">{summary.total}</Badge>
              {selectedProvince ? (
                <Badge variant="outline">{selectedProvince}</Badge>
              ) : null}
            </div>
          </div>
          <Button size="sm" variant="default" asChild>
            <Link href="/dashboard/surveys/campaigns">
              <ClipboardList className="h-4 w-4" />
              去采集
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-normal">
            有机型{" "}
            <span className="ml-1 font-medium text-foreground">
              {summary.withModel}
            </span>
          </Badge>
          <Badge variant="outline" className="font-normal">
            均配套率{" "}
            <span className="ml-1 font-medium text-foreground">
              {summary.avgRate}
            </span>
          </Badge>
          <Badge variant="outline" className="font-normal">
            标本量{" "}
            <span className="ml-1 font-medium text-foreground">
              {summary.mindraySamples}
            </span>
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索名称、分公司、机型…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
          <Button
            size="sm"
            variant={expandedCols ? "secondary" : "outline"}
            className="h-9 shrink-0"
            onClick={() => setExpandedCols((v) => !v)}
          >
            <Columns2 className="h-4 w-4" />
            {expandedCols ? "收起" : "更多列"}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-auto">
          <table
            className={cn(
              "w-full caption-bottom text-sm",
              expandedCols && "min-w-[920px]",
            )}
          >
            <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_var(--border)]">
              <TableRow className="hover:bg-transparent">
                {columns.map((key) => (
                  <TableHead
                    key={key}
                    className="h-10 whitespace-nowrap px-3 text-xs"
                  >
                    {archiveFieldLabel(key)}
                  </TableHead>
                ))}
                <TableHead className="h-10 w-8 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length + 1}
                    className="h-36 text-center text-sm text-muted-foreground"
                  >
                    暂无匹配医院
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((hospital) => {
                  const active =
                    selectedId === hospital.id && detailOpen;
                  const hovered = hoveredId === hospital.id;
                  return (
                    <TableRow
                      key={hospital.id}
                      data-state={active ? "selected" : undefined}
                      className={cn(
                        "group cursor-pointer border-b",
                        "hover:bg-accent/60",
                        active && "bg-muted",
                      )}
                      onClick={() => openDetail(hospital.id)}
                      onMouseEnter={() => setHoveredId(hospital.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      {columns.map((key) => (
                        <TableCell
                          key={key}
                          className={cn(
                            "max-w-[160px] truncate px-3 py-3 text-sm",
                            key === "customerName" && "font-medium",
                            (key === "matchingRate" ||
                              key === "mindraySampleVolume" ||
                              key === "totalSampleVolume") &&
                              "tabular-nums text-muted-foreground",
                          )}
                          title={cellValue(hospital, key)}
                        >
                          {cellValue(hospital, key)}
                        </TableCell>
                      ))}
                      <TableCell className="w-8 px-2 py-3">
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-opacity",
                            hovered || active
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </table>
        </div>
      </div>

      <Separator />

      <div className="flex shrink-0 items-center px-4 py-3">
        <span className="text-xs text-muted-foreground">
          共 {filtered.length} 家
        </span>
      </div>

      <HospitalDetailSheet
        hospitalId={selectedId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
