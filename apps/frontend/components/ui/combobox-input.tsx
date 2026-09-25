"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ComboboxInputProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function ComboboxInput({
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  id,
  className,
}: ComboboxInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const uniq = Array.from(new Set(options.map((o) => o.trim()).filter(Boolean)));
    if (!q) return uniq;
    return uniq.filter((o) => o.toLowerCase().includes(q));
  }, [options, value]);

  const shown = filtered.slice(0, 80);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value, open]);

  const pick = (opt: string) => {
    onChange(opt);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          required={required}
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
                Math.min(i + 1, Math.max(shown.length - 1, 0)),
              );
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter" && open && activeIndex >= 0 && shown[activeIndex]) {
              e.preventDefault();
              pick(shown[activeIndex]);
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
          aria-label="展开选项"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </div>

      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {shown.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              {value.trim()
                ? `无匹配项，将使用「${value.trim()}」`
                : "输入或从列表选择"}
            </li>
          ) : (
            shown.map((opt, idx) => (
              <li key={opt} role="option" aria-selected={value === opt}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    (value === opt || idx === activeIndex) &&
                      "bg-accent text-accent-foreground",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt)}
                >
                  {opt}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
