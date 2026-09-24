"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Search, ClipboardList, Columns2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold">化免客户档案</h2>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {summary.total} 家
          </Badge>
          {selectedProvince ? (
            <Badge variant="outline" className="shrink-0 text-xs">
              {selectedProvince}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            机型{" "}
            <span className="font-semibold text-foreground">
              {summary.withModel}
            </span>
          </span>
          <span>
            配套率{" "}
            <span className="font-semibold text-foreground">
              {summary.avgRate}
            </span>
          </span>
          <span>
            标本量{" "}
            <span className="font-semibold text-foreground">
              {summary.mindraySamples}
            </span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索客户名称、分公司、机型"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant={expandedCols ? "secondary" : "outline"}
          className="h-8 shrink-0 px-2"
          onClick={() => setExpandedCols((v) => !v)}
          title={expandedCols ? "收起列" : "展开更多列"}
        >
          <Columns2 className="h-4 w-4" />
          <span className="hidden sm:inline">
            {expandedCols ? "收起列" : "更多列"}
          </span>
        </Button>
        <Button size="sm" variant="default" className="h-8 shrink-0 px-2" asChild>
          <Link href="/dashboard/surveys/campaigns">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">去采集</span>
          </Link>
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-auto">
          <table
            className={cn(
              "w-full caption-bottom text-sm",
              expandedCols && "min-w-[880px]",
            )}
          >
            <thead className="sticky top-0 z-10 bg-white dark:bg-zinc-950 [&_tr]:border-b">
              <tr className="border-b transition-colors">
                {columns.map((key) => (
                  <th
                    key={key}
                    className="h-8 whitespace-nowrap px-2 text-left align-middle text-xs font-medium text-muted-foreground"
                  >
                    {archiveFieldLabel(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="h-32 p-2 text-center align-middle text-muted-foreground"
                  >
                    暂无匹配的化免客户档案
                  </td>
                </tr>
              ) : (
                filtered.map((hospital) => (
                  <tr
                    key={hospital.id}
                    className={cn(
                      "cursor-pointer border-b transition-colors hover:bg-muted/50",
                      selectedId === hospital.id &&
                        detailOpen &&
                        "bg-muted/60",
                    )}
                    onClick={() => openDetail(hospital.id)}
                  >
                    {columns.map((key) => (
                      <td
                        key={key}
                        className={cn(
                          "max-w-[140px] truncate px-2 py-1.5 align-middle text-xs",
                          key === "customerName" && "font-medium",
                          (key === "matchingRate" ||
                            key === "mindraySampleVolume" ||
                            key === "totalSampleVolume") &&
                            "text-primary",
                        )}
                        title={cellValue(hospital, key)}
                      >
                        {cellValue(hospital, key)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          共 {filtered.length} 条客户档案
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
