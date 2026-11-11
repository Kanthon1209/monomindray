"use client";

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { Calendar } from "lucide-react";

import { cn } from "@/lib/utils";

/** Parse a stored or pasted date into YYYY-MM-DD. Empty string if blank; null if invalid. */
export function parseTypedDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";
  const candidates: string[] = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    candidates.push(s);
  }
  const dotted = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (dotted) {
    candidates.push(
      `${dotted[1]}-${dotted[2].padStart(2, "0")}-${dotted[3].padStart(2, "0")}`,
    );
  }
  if (/^\d{8}$/.test(s)) {
    candidates.push(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
  }
  for (const iso of candidates) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    if (isValidYmd(m[1], m[2], m[3])) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

function isValidYmd(year: string, month: string, day: string): boolean {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return false;
  }
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  if (y < 1000 || mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(y, mo - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
  );
}

function typableDatePickerValue(raw: string): string {
  return parseTypedDate(raw) || "";
}

function digitsOnly(raw: string, max: number): string {
  return raw.replace(/\D/g, "").slice(0, max);
}

function padDateSegment(raw: string): string {
  if (raw.length === 1 && raw !== "0") return raw.padStart(2, "0");
  return raw;
}

type DateSegmentKey = "year" | "month" | "day";

function DateMaskSegment({
  segmentRef,
  value,
  placeholder,
  maxLength,
  disabled,
  ariaLabel,
  onChange,
  onBackspaceEmpty,
  onAdvance,
  onRetreat,
  onPasteDate,
  onBlur,
}: {
  segmentRef: RefObject<HTMLInputElement | null>;
  value: string;
  placeholder: string;
  maxLength: number;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (next: string) => void;
  onBackspaceEmpty: () => void;
  onAdvance: () => void;
  onRetreat: () => void;
  onPasteDate: (text: string) => boolean;
  onBlur: (event: FocusEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="relative inline-flex items-center">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center font-mono text-base tabular-nums md:text-sm"
      >
        <span className="invisible">{value}</span>
        <span className="text-muted-foreground">
          {placeholder.slice(value.length)}
        </span>
      </span>
      <input
        ref={segmentRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        pattern="[0-9]*"
        maxLength={maxLength}
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value, maxLength))}
        onFocus={(e) => e.target.select()}
        onBlur={onBlur}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (onPasteDate(text)) {
            e.preventDefault();
            return;
          }
          const digits = digitsOnly(text, maxLength);
          if (digits !== text) {
            e.preventDefault();
            onChange(digits);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !value) {
            e.preventDefault();
            onBackspaceEmpty();
            return;
          }
          if (
            (e.key === "/" || e.key === "-" || e.key === "." || e.key === " ") &&
            value
          ) {
            e.preventDefault();
            onAdvance();
            return;
          }
          const el = e.currentTarget;
          const start = el.selectionStart ?? 0;
          const end = el.selectionEnd ?? 0;
          if (e.key === "ArrowLeft" && start === 0 && end === 0) {
            e.preventDefault();
            onRetreat();
            return;
          }
          if (
            e.key === "ArrowRight" &&
            start === value.length &&
            end === value.length
          ) {
            e.preventDefault();
            onAdvance();
          }
        }}
        className={cn(
          "bg-transparent p-0 font-mono text-base tabular-nums text-foreground outline-none md:text-sm",
          "disabled:cursor-not-allowed",
        )}
        style={{ width: `${placeholder.length}ch` }}
      />
    </div>
  );
}

/**
 * Segmented YYYY/MM/DD date input: unfilled parts keep Y/M/D hints,
 * a calendar icon on the right opens the native picker, and complete
 * valid values are committed as YYYY-MM-DD.
 */
export function DateMaskInput({
  value,
  disabled,
  onChange,
  label = "日期",
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  /** Field name used in aria-labels and inline error messages. */
  label?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(value);
  const parsedInitial = typableDatePickerValue(value);
  const [year, setYear] = useState(() => parsedInitial.slice(0, 4));
  const [month, setMonth] = useState(() => parsedInitial.slice(5, 7));
  const [day, setDay] = useState(() => parsedInitial.slice(8, 10));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value === committedRef.current) return;
    committedRef.current = value;
    const iso = typableDatePickerValue(value);
    if (iso) {
      setYear(iso.slice(0, 4));
      setMonth(iso.slice(5, 7));
      setDay(iso.slice(8, 10));
      setError(null);
      return;
    }
    if (!value.trim()) {
      setYear("");
      setMonth("");
      setDay("");
      setError(null);
    }
  }, [value]);

  const pickerValue =
    isValidYmd(year, month, day) ? `${year}-${month}-${day}` : "";

  const commitIso = (iso: string) => {
    committedRef.current = iso;
    onChange(iso);
  };

  const applyIso = (iso: string) => {
    const parsed = typableDatePickerValue(iso);
    if (!parsed) return;
    setYear(parsed.slice(0, 4));
    setMonth(parsed.slice(5, 7));
    setDay(parsed.slice(8, 10));
    setError(null);
    commitIso(parsed);
  };

  const tryPasteDate = (text: string) => {
    const parsed = parseTypedDate(text);
    if (parsed) {
      applyIso(parsed);
      return true;
    }
    return false;
  };

  const focusSegment = (key: DateSegmentKey) => {
    const el =
      key === "year" ? yearRef.current : key === "month" ? monthRef.current : dayRef.current;
    if (!el) return;
    el.focus();
    el.select();
  };

  const syncCommit = (nextYear: string, nextMonth: string, nextDay: string) => {
    if (!nextYear && !nextMonth && !nextDay) {
      commitIso("");
      return;
    }
    // Do not auto-pad here: a lone "3" in the day may still become "30".
    if (isValidYmd(nextYear, nextMonth, nextDay)) {
      commitIso(`${nextYear}-${nextMonth}-${nextDay}`);
      return;
    }
    // Keep a non-ISO draft so submit can reject incomplete/invalid values
    // even if the field has not blurred yet.
    commitIso(`${nextYear}/${nextMonth}/${nextDay}`);
  };

  const setYearDigits = (next: string) => {
    setError(null);
    setYear(next);
    syncCommit(next, month, day);
    if (next.length === 4) focusSegment("month");
  };

  const setMonthDigits = (next: string) => {
    setError(null);
    let monthNext = next;
    if (next.length === 1 && next >= "2" && next <= "9") {
      monthNext = next.padStart(2, "0");
    }
    setMonth(monthNext);
    syncCommit(year, monthNext, day);
    if (monthNext.length === 2) focusSegment("day");
  };

  const setDayDigits = (next: string) => {
    setError(null);
    let dayNext = next;
    if (next.length === 1 && next >= "4" && next <= "9") {
      dayNext = next.padStart(2, "0");
    }
    setDay(dayNext);
    syncCommit(year, month, dayNext);
  };

  const finalize = () => {
    const nextMonth = padDateSegment(month);
    const nextDay = padDateSegment(day);
    if (nextMonth !== month) setMonth(nextMonth);
    if (nextDay !== day) setDay(nextDay);

    if (!year && !nextMonth && !nextDay) {
      setError(null);
      commitIso("");
      return;
    }
    if (isValidYmd(year, nextMonth, nextDay)) {
      setError(null);
      commitIso(`${year}-${nextMonth}-${nextDay}`);
      return;
    }
    if (year.length === 4 && nextMonth.length === 2 && nextDay.length === 2) {
      setError(`${label}无效，请检查月和日`);
    } else {
      setError(`请输入完整的${label}（YYYY/MM/DD）`);
    }
    commitIso("");
  };

  const handleGroupBlur = (event?: FocusEvent<HTMLElement>) => {
    const next = (event?.relatedTarget ?? null) as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    if (!next) {
      requestAnimationFrame(() => {
        if (!rootRef.current?.contains(document.activeElement)) {
          finalize();
        }
      });
      return;
    }
    flushSync(() => finalize());
  };

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      if (!root.contains(document.activeElement)) return;
      flushSync(() => finalize());
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  });

  const backspaceFromMonth = () => {
    setYear((prev) => prev.slice(0, -1));
    focusSegment("year");
  };

  const backspaceFromDay = () => {
    setMonth((prev) => prev.slice(0, -1));
    focusSegment("month");
  };

  return (
    <div className="space-y-1">
      <div
        ref={rootRef}
        role="group"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={cn(
          "relative flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-transparent pr-10 pl-3 text-base shadow-xs md:text-sm",
          "transition-[color,box-shadow] outline-none",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          error &&
            "border-destructive focus-within:border-destructive focus-within:ring-destructive/20 dark:focus-within:ring-destructive/40",
          disabled && "pointer-events-none cursor-not-allowed opacity-50",
        )}
      >
        <div
          className="flex min-w-0 flex-1 cursor-text items-center"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("input")) return;
            if (!year) focusSegment("year");
            else if (!month) focusSegment("month");
            else focusSegment("day");
          }}
        >
          <DateMaskSegment
            segmentRef={yearRef}
            value={year}
            placeholder="YYYY"
            maxLength={4}
            disabled={disabled}
            ariaLabel={`${label}年`}
            onChange={setYearDigits}
            onBackspaceEmpty={() => {}}
            onAdvance={() => focusSegment("month")}
            onRetreat={() => {}}
            onPasteDate={tryPasteDate}
            onBlur={handleGroupBlur}
          />
          <span aria-hidden className="px-0.5 font-mono text-muted-foreground select-none">
            /
          </span>
          <DateMaskSegment
            segmentRef={monthRef}
            value={month}
            placeholder="MM"
            maxLength={2}
            disabled={disabled}
            ariaLabel={`${label}月`}
            onChange={setMonthDigits}
            onBackspaceEmpty={backspaceFromMonth}
            onAdvance={() => focusSegment("day")}
            onRetreat={() => focusSegment("year")}
            onPasteDate={tryPasteDate}
            onBlur={handleGroupBlur}
          />
          <span aria-hidden className="px-0.5 font-mono text-muted-foreground select-none">
            /
          </span>
          <DateMaskSegment
            segmentRef={dayRef}
            value={day}
            placeholder="DD"
            maxLength={2}
            disabled={disabled}
            ariaLabel={`${label}日`}
            onChange={setDayDigits}
            onBackspaceEmpty={backspaceFromDay}
            onAdvance={() => {}}
            onRetreat={() => focusSegment("month")}
            onPasteDate={tryPasteDate}
            onBlur={handleGroupBlur}
          />
        </div>
        <input
          type="date"
          tabIndex={-1}
          disabled={disabled}
          aria-label={`选择${label}`}
          value={pickerValue}
          onChange={(e) => {
            if (e.target.value) applyIso(e.target.value);
          }}
          className="absolute top-0 right-0 z-10 h-full w-9 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-1.5 z-0 flex size-7 -translate-y-1/2 items-center justify-center text-muted-foreground"
        >
          <Calendar className="size-4" />
        </span>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
