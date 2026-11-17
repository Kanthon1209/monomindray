/** Product-facing timestamps are always shown in Asia/Shanghai, independent of
 *  the Node/browser local timezone. The web container runs in UTC, so using
 *  Date#getHours() during SSR would be eight hours behind China time. */
const SHANGHAI = "Asia/Shanghai";

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

export function formatShanghaiDateTime(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: SHANGHAI,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);
    const y = part(parts, "year");
    const m = part(parts, "month");
    const day = part(parts, "day");
    const hh = part(parts, "hour");
    const mm = part(parts, "minute");
    const ss = part(parts, "second");
    if (!y || !m || !day || !hh || !mm || !ss) return value;
    return `${y}/${m}/${day} ${hh}:${mm}:${ss}`;
  } catch {
    return value;
  }
}
