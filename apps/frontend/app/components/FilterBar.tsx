"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterOptions } from "@/lib/types";

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (key: keyof FilterOptions, value: string) => void;
  modelOptions: string[];
  levelOptions: string[];
}

const regionOptions = [
  { label: "全省", value: "all" },
  { label: "皖北", value: "wanbei" },
  { label: "皖中", value: "wanzhong" },
  { label: "皖南", value: "wannan" },
];

export function FilterBar({
  filters,
  onFilterChange,
  modelOptions,
  levelOptions,
}: FilterBarProps) {
  return (
    <div className="flex h-auto items-center gap-4 overflow-x-auto border-b bg-white px-4 py-2.5 dark:bg-zinc-950 md:h-16 md:gap-6 md:px-6 md:py-0">
      <FilterSelect
        label="大区"
        value={filters.region}
        onChange={(v) => onFilterChange("region", v)}
        options={regionOptions}
      />
      <FilterSelect
        label="客户级别"
        value={filters.customerLevel}
        onChange={(v) => onFilterChange("customerLevel", v)}
        options={[
          { label: "全部", value: "all" },
          ...levelOptions.map((x) => ({ label: x, value: x })),
        ]}
      />
      <FilterSelect
        label="机型"
        value={filters.model}
        onChange={(v) => onFilterChange("model", v)}
        options={[
          { label: "全部", value: "all" },
          ...modelOptions.map((x) => ({ label: x, value: x })),
        ]}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-28 md:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
