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
    <div className="shrink-0 border-b bg-background px-3 py-3 md:px-6 md:py-3">
      <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap md:items-end md:gap-4">
        <FilterSelect
          label="大区"
          value={filters.region}
          onChange={(v) => onFilterChange("region", v)}
          options={regionOptions}
        />
        <FilterSelect
          label="客户等级"
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
    <div className="flex min-w-0 flex-col gap-1.5 md:w-36">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full">
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
