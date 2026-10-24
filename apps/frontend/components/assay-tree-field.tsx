"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchAssayTree, type AssayTreeNode } from "@/lib/business";
import { Label } from "@/components/ui/label";

export type AssayBlockAnswer = {
  codes: string[];
};

export function normalizeAssayBlockAnswer(value: any): AssayBlockAnswer {
  if (Array.isArray(value)) {
    return { codes: value.map(String).map((s) => s.trim()).filter(Boolean) };
  }
  if (value && typeof value === "object" && Array.isArray(value.codes)) {
    return {
      codes: value.codes.map(String).map((s: string) => s.trim()).filter(Boolean),
    };
  }
  return { codes: [] };
}

type Props = {
  value: any;
  onChange: (next: AssayBlockAnswer) => void;
  disabled?: boolean;
};

function collectItems(nodes: AssayTreeNode[]): AssayTreeNode[] {
  const out: AssayTreeNode[] = [];
  const walk = (list: AssayTreeNode[]) => {
    for (const n of list) {
      if (n.kind === "item") out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function AssayTreeField({ value, onChange, disabled }: Props) {
  const [tree, setTree] = useState<AssayTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openLines, setOpenLines] = useState<Record<string, boolean>>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const answer = useMemo(() => normalizeAssayBlockAnswer(value), [value]);
  const selected = useMemo(() => new Set(answer.codes), [answer.codes]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetchAssayTree();
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setTree([]);
      } else {
        const items = res.items || [];
        setTree(items);
        const selectedCodes = new Set(normalizeAssayBlockAnswer(value).codes);
        const lines: Record<string, boolean> = {};
        const cats: Record<string, boolean> = {};
        for (const line of items) {
          lines[line.code] = true;
          for (const cat of line.children || []) {
            const catItems = (cat.children || []).filter((c) => c.kind === "item");
            const catHas = catItems.some((i) => selectedCodes.has(i.code));
            // In read-only/review mode, auto-expand categories that have checks.
            cats[cat.code] = disabled ? catHas : false;
          }
        }
        setOpenLines(lines);
        setOpenCats(cats);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // value/disabled only seed initial expand state; tree fetch is once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCode = (code: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    onChange({ codes: Array.from(next) });
  };

  const toggleMany = (codes: string[], checked: boolean) => {
    const next = new Set(selected);
    for (const c of codes) {
      if (checked) next.add(c);
      else next.delete(c);
    }
    onChange({ codes: Array.from(next) });
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">加载检测项目树…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!tree.length) {
    return <p className="text-sm text-muted-foreground">暂无检测项目目录</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        已选 {selected.size} 项（按检测线 → 类别展开，勾选叶子项目）
      </p>
      {tree.map((line) => {
        const lineItems = collectItems([line]);
        const lineCodes = lineItems.map((i) => i.code);
        const lineSelected = lineCodes.filter((c) => selected.has(c)).length;
        const lineOpen = !!openLines[line.code];
        return (
          <div key={line.code} className="rounded-md border">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
              onClick={() =>
                setOpenLines((s) => ({ ...s, [line.code]: !s[line.code] }))
              }
            >
              <span>
                {lineOpen ? "▾" : "▸"} {line.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {lineSelected}/{lineCodes.length}
                </span>
              </span>
              {!disabled ? (
                <span
                  className="text-xs font-normal text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    const allOn =
                      lineSelected === lineCodes.length && lineCodes.length > 0;
                    toggleMany(lineCodes, !allOn);
                  }}
                >
                  {lineSelected === lineCodes.length && lineCodes.length > 0
                    ? "取消全选"
                    : "全选"}
                </span>
              ) : null}
            </button>
            {lineOpen ? (
              <div className="space-y-2 border-t px-3 py-2">
                {(line.children || []).map((cat) => {
                  const catItems = (cat.children || []).filter((c) => c.kind === "item");
                  const catCodes = catItems.map((i) => i.code);
                  const catSelected = catCodes.filter((c) => selected.has(c)).length;
                  const catOpen = !!openCats[cat.code];
                  return (
                    <div key={cat.code} className="rounded border bg-muted/20">
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-2 text-left text-sm"
                          onClick={() =>
                            setOpenCats((s) => ({
                              ...s,
                              [cat.code]: !s[cat.code],
                            }))
                          }
                        >
                          <span>{catOpen ? "▾" : "▸"}</span>
                          <span className="font-medium">{cat.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {catSelected}/{catCodes.length}
                          </span>
                        </button>
                        {!disabled ? (
                          <button
                            type="button"
                            className="text-xs text-primary"
                            disabled={catCodes.length === 0}
                            onClick={() => {
                              const allOn =
                                catSelected === catCodes.length &&
                                catCodes.length > 0;
                              toggleMany(catCodes, !allOn);
                            }}
                          >
                            {catSelected === catCodes.length && catCodes.length > 0
                              ? "取消"
                              : "全选"}
                          </button>
                        ) : null}
                      </div>
                      {catOpen ? (
                        <div className="grid gap-1 border-t px-2 py-2 sm:grid-cols-2 lg:grid-cols-3">
                          {catItems.map((item) => (
                            <label
                              key={item.code}
                              className={`flex min-h-9 items-center gap-2 rounded px-1.5 text-sm ${disabled ? "" : "cursor-pointer"}`}
                            >
                              <input
                                type="checkbox"
                                className="size-4 rounded border"
                                checked={selected.has(item.code)}
                                disabled={disabled}
                                onChange={(e) =>
                                  toggleCode(item.code, e.target.checked)
                                }
                              />
                              <span>{item.name}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      {!disabled ? (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">快捷</Label>
          <button
            type="button"
            className="text-xs text-primary"
            onClick={() => onChange({ codes: [] })}
          >
            清空已选
          </button>
        </div>
      ) : null}
    </div>
  );
}
