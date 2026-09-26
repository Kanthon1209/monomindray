"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AssayOption = {
  id?: string;
  name: string;
  company?: string;
  ownership?: string;
};

type AssayMultiSelectProps = {
  value: string[];
  options: AssayOption[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Allow typing a name not in the dictionary */
  allowCustom?: boolean;
};

export function AssayMultiSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder = "搜索并选择检测项目",
  allowCustom = true,
}: AssayMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean) : []),
    [value],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = options.filter((o) => o.name && !selectedSet.has(o.name));
    if (!q) return list.slice(0, 80);
    return list
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.company || "").toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [options, query, selectedSet]);

  const canAddCustom =
    allowCustom &&
    query.trim() &&
    !selectedSet.has(query.trim()) &&
    !options.some((o) => o.name === query.trim());

  const add = (name: string) => {
    const n = name.trim();
    if (!n || selectedSet.has(n)) return;
    onChange([...selected, n]);
    setQuery("");
    setOpen(false);
  };

  const remove = (name: string) => {
    onChange(selected.filter((s) => s !== name));
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1 pr-1">
              {name}
              {!disabled ? (
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  onClick={() => remove(name)}
                  aria-label={`移除 ${name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}

      {!disabled ? (
        <div className="relative">
          <div className="relative">
            <Input
              value={query}
              placeholder={placeholder}
              autoComplete="off"
              className="pr-8"
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered[0]) add(filtered[0].name);
                  else if (canAddCustom) add(query);
                }
                if (e.key === "Escape") setOpen(false);
              }}
            />
            <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          {open ? (
            <ul
              className={cn(
                "absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md",
              )}
            >
              {filtered.length === 0 && !canAddCustom ? (
                <li className="px-2 py-1.5 text-muted-foreground">无匹配项目</li>
              ) : null}
              {filtered.map((o) => (
                <li key={`${o.id || o.name}-${o.name}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(o.name)}
                  >
                    <Check className="h-3.5 w-3.5 opacity-0" />
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.company ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {o.company}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
              {canAddCustom ? (
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-primary hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(query)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加「{query.trim()}」
                  </button>
                </li>
              ) : null}
              <li className="border-t">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-xs"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOpen(false)}
                >
                  关闭
                </Button>
              </li>
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
