"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { filterOptions } from "@/lib/mock-data";
import type { FilterOptions } from "@/lib/types";

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (key: keyof FilterOptions, value: string) => void;
}

interface FilterConfig {
  key: keyof FilterOptions;
  label: string;
  options: { label: string; value: string }[];
}

const filterConfigs: FilterConfig[] = [
  { key: "region", label: "当前区域", options: filterOptions.region },
  { key: "hospitalLevel", label: "医院级别", options: filterOptions.hospitalLevel },
  { key: "hospitalType", label: "医院类型", options: filterOptions.hospitalType },
  { key: "deviceCategory", label: "开展装置", options: filterOptions.deviceCategory },
  { key: "deviceModel", label: "设备型号", options: filterOptions.deviceModel },
];

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  return (
    <div className="flex h-auto items-center gap-4 overflow-x-auto border-b bg-white px-4 py-2.5 dark:bg-zinc-950 md:h-16 md:gap-6 md:px-6 md:py-0">
      {filterConfigs.map((config) => (
        <div key={config.key} className="flex shrink-0 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {config.label}
          </label>
          <Select
            value={filters[config.key]}
            onValueChange={(value) => onFilterChange(config.key, value)}
          >
            <SelectTrigger className="h-8 w-28 md:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
