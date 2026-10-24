"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchEqaFields, type EqaFieldNode } from "@/lib/eqa";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EqaScopeAnswer = {
  participating: boolean;
  codes: string[];
};

export type EqaBlockAnswer = {
  year: number;
  national: EqaScopeAnswer;
  provincial: EqaScopeAnswer;
};

export type EqaBlockFieldConfig = {
  enableNational?: boolean;
  enableProvincial?: boolean;
};

const emptyScope = (): EqaScopeAnswer => ({ participating: false, codes: [] });

/** 参评由已选科目推导：无科目 = 未参与，避免「勾了级但无细项」的脏状态。 */
export function normalizeEqaBlockAnswer(
  value: any,
  defaultYear?: number,
): EqaBlockAnswer {
  const year =
    typeof value?.year === "number" && value.year > 0
      ? value.year
      : defaultYear && defaultYear > 0
        ? defaultYear
        : new Date().getFullYear();
  const parseScope = (raw: any): EqaScopeAnswer => {
    if (!raw || typeof raw !== "object") return emptyScope();
    const codes = Array.isArray(raw.codes)
      ? raw.codes.map(String).filter(Boolean)
      : [];
    return {
      participating: codes.length > 0,
      codes,
    };
  };
  return {
    year,
    national: parseScope(value?.national),
    provincial: parseScope(value?.provincial),
  };
}

function subjectsUnder(
  tree: EqaFieldNode[],
  parentCode: string,
): { code: string; name: string }[] {
  const roots = tree || [];
  const parent =
    roots.find((n) => n.code === parentCode) ||
    roots.find((n) =>
      (n.children || []).some((c) => c.parentCode === parentCode),
    );
  const children =
    parent?.children?.filter((c) => c.valueType === "boolean") ||
    roots.filter(
      (n) => n.parentCode === parentCode && n.valueType === "boolean",
    );
  // Also flatten if tree is flat-ish
  if (children.length) {
    return children
      .slice()
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((c) => ({ code: c.code, name: c.name }));
  }
  // Fallback: any boolean whose code starts with national./provincial.
  const prefix =
    parentCode === "scope.national"
      ? "national."
      : parentCode === "scope.provincial"
        ? "provincial."
        : "";
  const flat: EqaFieldNode[] = [];
  const walk = (nodes: EqaFieldNode[]) => {
    for (const n of nodes) {
      flat.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(roots);
  return flat
    .filter(
      (n) =>
        n.valueType === "boolean" &&
        (n.parentCode === parentCode ||
          (prefix && n.code.startsWith(prefix))),
    )
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((n) => ({ code: n.code, name: n.name }));
}

type Props = {
  value: any;
  onChange: (next: EqaBlockAnswer) => void;
  disabled?: boolean;
  config?: EqaBlockFieldConfig;
  defaultYear?: number;
};

export function EqaParticipationField({
  value,
  onChange,
  disabled,
  config,
  defaultYear,
}: Props) {
  const enableNational = config?.enableNational !== false;
  const enableProvincial = config?.enableProvincial !== false;
  const [tree, setTree] = useState<EqaFieldNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const answer = useMemo(
    () => normalizeEqaBlockAnswer(value, defaultYear),
    [value, defaultYear],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetchEqaFields();
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setTree([]);
      } else {
        setTree(res.data?.items || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nationalSubjects = useMemo(
    () => subjectsUnder(tree, "scope.national"),
    [tree],
  );
  const provincialSubjects = useMemo(
    () => subjectsUnder(tree, "scope.provincial"),
    [tree],
  );

  const patch = (partial: Partial<EqaBlockAnswer>) => {
    onChange({ ...answer, ...partial });
  };

  const patchScope = (
    scope: "national" | "provincial",
    codes: string[],
  ) => {
    const unique = Array.from(new Set(codes.filter(Boolean)));
    patch({
      [scope]: {
        participating: unique.length > 0,
        codes: unique,
      },
    });
  };

  const renderScope = (
    scope: "national" | "provincial",
    label: string,
    subjects: { code: string; name: string }[],
  ) => {
    const current = answer[scope];
    const allCodes = subjects.map((s) => s.code);
    const selectedCount = allCodes.filter((c) =>
      current.codes.includes(c),
    ).length;
    const allOn = selectedCount === allCodes.length && allCodes.length > 0;
    const partial = selectedCount > 0 && !allOn;

    return (
      <div className="space-y-3 rounded-md border p-3">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">
            {current.participating
              ? `已选 ${selectedCount} 项`
              : "未参与（勾选科目即算参与）"}
          </span>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">加载科目…</p>
        ) : subjects.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无科目数据</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 rounded border"
                checked={allOn}
                disabled={disabled}
                ref={(el) => {
                  if (el) el.indeterminate = partial;
                }}
                onChange={() => {
                  patchScope(scope, allOn ? [] : allCodes);
                }}
              />
              <span>全选</span>
            </label>
            {subjects.map((s) => {
              const checked = current.codes.includes(s.code);
              return (
                <label
                  key={s.code}
                  className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const set = new Set(current.codes);
                      if (e.target.checked) set.add(s.code);
                      else set.delete(s.code);
                      patchScope(scope, Array.from(set));
                    }}
                  />
                  <span>{s.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid max-w-xs gap-2">
        <Label>参评年份</Label>
        <Input
          type="number"
          value={answer.year || ""}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            patch({ year: Number.isFinite(n) ? n : answer.year });
          }}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {enableNational
        ? renderScope("national", "国家级（国考）", nationalSubjects)
        : null}
      {enableProvincial
        ? renderScope("provincial", "省级（省考）", provincialSubjects)
        : null}
      <p className="text-xs text-muted-foreground">
        勾选任一科目即算参与该级 EQA；可先点「全选」再取消未参加的细项。国考、省考可都选、只选其一或都不选。
      </p>
    </div>
  );
}
