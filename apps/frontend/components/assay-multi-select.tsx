"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

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
  options?: AssayOption[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Allow typing a name not in the dictionary */
  allowCustom?: boolean;
};

function normalizeList(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function AssayMultiSelect({
  value,
  options = [],
  onChange,
  disabled,
  placeholder = "输入一项",
  allowCustom = true,
}: AssayMultiSelectProps) {
  const [rows, setRows] = useState<string[]>(() => {
    const list = normalizeList(value).filter(Boolean);
    return list.length > 0 ? list : disabled ? [] : [""];
  });
  const [suggestFor, setSuggestFor] = useState<number | null>(null);

  useEffect(() => {
    const incoming = normalizeList(value).filter(Boolean);
    const current = rows.map((r) => r.trim()).filter(Boolean);
    if (JSON.stringify(incoming) === JSON.stringify(current)) return;
    setRows(incoming.length > 0 ? incoming : disabled ? [] : [""]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from props only
  }, [value, disabled]);

  const emit = (next: string[]) => {
    setRows(next.length > 0 ? next : disabled ? [] : [""]);
    onChange(next.map((s) => s.trim()).filter(Boolean));
  };

  const setRow = (index: number, text: string) => {
    const next = [...rows];
    next[index] = text;
    setRows(next);
    onChange(next.map((s) => s.trim()).filter(Boolean));
  };

  const addRow = () => {
    if (disabled) return;
    setRows((prev) => [...prev, ""]);
    setSuggestFor(rows.length);
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    emit(next);
    setSuggestFor(null);
  };

  const optionNames = useMemo(
    () => new Set(options.map((o) => o.name).filter(Boolean)),
    [options],
  );

  const suggestionsFor = (index: number, query: string) => {
    if (!options.length) return [];
    const q = query.trim().toLowerCase();
    const taken = new Set(
      rows
        .map((r, i) => (i === index ? "" : r.trim()))
        .filter(Boolean),
    );
    const list = options.filter(
      (o) => o.name && !taken.has(o.name),
    );
    if (!q) return list.slice(0, 40);
    return list
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.company || "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  };

  if (disabled && rows.filter((r) => r.trim()).length === 0) {
    return <p className="text-sm text-muted-foreground">未填写</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const suggestions = suggestionsFor(index, row);
        const showSuggest =
          !disabled &&
          options.length > 0 &&
          suggestFor === index &&
          (suggestions.length > 0 ||
            (allowCustom &&
              row.trim() &&
              !optionNames.has(row.trim())));

        return (
          <div key={index} className="relative space-y-1">
            <div className="flex items-center gap-2">
              <Input
                value={row}
                disabled={disabled}
                placeholder={placeholder}
                autoComplete="off"
                className="min-h-10 flex-1"
                onChange={(e) => {
                  setRow(index, e.target.value);
                  setSuggestFor(index);
                }}
                onFocus={() => setSuggestFor(index)}
                onBlur={() => {
                  // delay so suggestion click can fire
                  window.setTimeout(() => {
                    setSuggestFor((cur) => (cur === index ? null : cur));
                  }, 150);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const first = suggestions[0];
                    if (first) {
                      setRow(index, first.name);
                      setSuggestFor(null);
                    } else if (allowCustom && row.trim()) {
                      setSuggestFor(null);
                      addRow();
                    } else {
                      addRow();
                    }
                  }
                }}
              />
              {!disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-muted-foreground"
                  onClick={() => removeRow(index)}
                  aria-label="删除此项"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            {showSuggest ? (
              <ul
                className={cn(
                  "absolute z-40 max-h-48 w-[calc(100%-2.75rem)] overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md",
                )}
              >
                {suggestions.map((o) => (
                  <li key={`${o.id || o.name}-${o.name}`}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setRow(index, o.name);
                        setSuggestFor(null);
                      }}
                    >
                      <span className="flex-1 truncate">{o.name}</span>
                      {o.company ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {o.company}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
                {allowCustom &&
                row.trim() &&
                !optionNames.has(row.trim()) &&
                !suggestions.some((o) => o.name === row.trim()) ? (
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-primary hover:bg-accent"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setRow(index, row.trim());
                        setSuggestFor(null);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      使用「{row.trim()}」
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        );
      })}

      {!disabled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 w-full sm:w-auto"
          onClick={addRow}
        >
          <Plus className="mr-1 h-4 w-4" />
          添加一项
        </Button>
      ) : null}
    </div>
  );
}
