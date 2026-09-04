/**
 * Every date in the app is a local calendar day in YYYY-MM-DD form. The zone
 * comes from the process TZ variable; UTC is deliberately avoided, or a late
 * dinner at 23:30 would land on the next day.
 */

export type DateStr = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function toDateStr(date: Date): DateStr {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(value: DateStr): Date {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function today(): DateStr {
  return toDateStr(new Date());
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(value: DateStr): number {
  return parseDate(value).getDay();
}

export function addDays(value: DateStr, days: number): DateStr {
  const d = parseDate(value);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function isFuture(value: DateStr, reference: DateStr = today()): boolean {
  return value > reference;
}

/** Monday (weekStart = 1) or Sunday (weekStart = 0) of the week holding the date. */
export function startOfWeek(value: DateStr, weekStart: 0 | 1 = 1): DateStr {
  const day = weekdayOf(value);
  const diff = weekStart === 1 ? (day === 0 ? 6 : day - 1) : day;
  return addDays(value, -diff);
}

export function daysBetween(from: DateStr, to: DateStr): number {
  const ms = parseDate(to).getTime() - parseDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

