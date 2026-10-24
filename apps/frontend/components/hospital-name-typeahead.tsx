"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  searchHospitalsForSurvey,
  type HospitalSearchOption,
} from "@/lib/business";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type HospitalNameTypeaheadProps = {
  value: string;
  onChange: (value: string) => void;
  onSelectHospital?: (hospital: HospitalSearchOption) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
};

export function HospitalNameTypeahead({
  value,
  onChange,
  onSelectHospital,
  disabled,
  placeholder = "输入医院名称搜索",
  id,
  className,
}: HospitalNameTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HospitalSearchOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const reqSeq = useRef(0);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (disabled) return;
    const q = value.trim();
    if (!open) return;
    if (!q) {
      setItems([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }
    const seq = ++reqSeq.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const res = await searchHospitalsForSurvey(q, 40);
      if (seq !== reqSeq.current) return;
      setLoading(false);
      if (!res.error) setItems(res.items);
      else setItems([]);
      setActiveIndex(-1);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [value, open, disabled]);

  const pick = (item: HospitalSearchOption) => {
    onChange(item.name);
    onSelectHospital?.(item);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="pr-8"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) =>
                Math.min(i + 1, Math.max(items.length - 1, 0)),
              );
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter" && open && activeIndex >= 0 && items[activeIndex]) {
              e.preventDefault();
              pick(items[activeIndex]);
            }
          }}
        />
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {items.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              {loading
                ? "搜索中…"
                : value.trim()
                  ? `无匹配医院，将使用「${value.trim()}」`
                  : "输入关键字搜索已有医院"}
            </li>
          ) : (
            items.map((item, idx) => (
              <li key={item.id} role="option" aria-selected={value === item.name}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    (value === item.name || idx === activeIndex) &&
                      "bg-accent text-accent-foreground",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {[item.province, item.city, item.district, item.level]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
