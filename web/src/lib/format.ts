import { WEEKDAY_FULL, WEEKDAY_SHORT } from '@shared/index';

/** Dates across the app are local calendar days in YYYY-MM-DD form. */
export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/**
 * Today comes from the server: the journal follows the server time zone, and
 * when the browser sits in another one (a container on one TZ, a phone or a
 * laptop on another) the local date drifts from the server date for a few
 * hours each day, making an open day look untouched.
 * The value is set once while the app loads, before any page renders; until
 * then the local date serves as a fallback.
 */
let serverToday: string | null = null;

export function setServerToday(date: string): void {
  serverToday = date;
}

export function today(): string {
  return serverToday ?? toDateStr(new Date());
}

/** The browser's own date, used to spot a mismatch and report it. */
export function browserToday(): string {
  return toDateStr(new Date());
}

export function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

export function weekdayOf(value: string): number {
  return parseDate(value).getDay();
}

/** Monday of the week the date falls into. */
export function startOfWeek(value: string): string {
  const day = weekdayOf(value);
  return addDays(value, -(day === 0 ? 6 : day - 1));
}

export function weekdayShort(value: string): string {
  return WEEKDAY_SHORT[weekdayOf(value)] ?? '';
}

export function weekdayFull(value: string): string {
  return WEEKDAY_FULL[weekdayOf(value)] ?? '';
}

const monthsGenitive = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** "12 March", with the year only when it is not the current one. */
export function formatDate(value: string): string {
  const date = parseDate(value);
  const base = `${date.getDate()} ${monthsGenitive[date.getMonth()]}`;
  return date.getFullYear() === new Date().getFullYear()
    ? base
    : `${base} ${date.getFullYear()}`;
}

export function formatDateShort(value: string): string {
  const date = parseDate(value);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Today / Yesterday / Tomorrow instead of a date where that reads better. */
export function relativeDayLabel(value: string): string {
  const now = today();
  if (value === now) return 'Сегодня';
  if (value === addDays(now, -1)) return 'Вчера';
  if (value === addDays(now, 1)) return 'Завтра';
  return formatDate(value);
}

export function isFuture(value: string): boolean {
  return value > today();
}

/** Numbers without trailing zeros: 82 rather than 82.0, but 82.4 is kept. */
export function num(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Number(value.toFixed(digits));
  return String(rounded).replace('.', ',');
}

export function signed(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—';
  const formatted = num(Math.abs(value), digits);
  if (value === 0) return `0`;
  return `${value > 0 ? '+' : '−'}${formatted}`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** A compact form of the target volume, such as 4x8-12 or 3x45 sec. */
export function formatTarget(target: {
  targetSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetSeconds: number | null;
}): string {
  const { targetSets, targetRepsMin, targetRepsMax, targetSeconds } = target;
  if (targetSeconds !== null) {
    const value = targetSeconds >= 60 ? `${Math.round(targetSeconds / 60)} мин` : `${targetSeconds} сек`;
    // Cardio has a single set, and "1x40 min" reads as pure noise.
    return targetSets > 1 ? `${targetSets}×${value}` : value;
  }
  if (targetRepsMin !== null && targetRepsMax !== null && targetRepsMin !== targetRepsMax) {
    return `${targetSets}×${targetRepsMin}–${targetRepsMax}`;
  }
  const reps = targetRepsMax ?? targetRepsMin;
  return reps === null ? `${targetSets} подх.` : `${targetSets}×${reps}`;
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}


/**
 * Time is entered in minutes: only cardio and mobility are measured that way.
 * The database always stores seconds; the conversion lives in the UI alone.
 */
export function secondsToMinutes(seconds: number | null): string {
  if (seconds === null) return '';
  return String(Math.round(seconds / 60));
}

export function minutesToSeconds(value: string): number | null {
  if (value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 60);
}

/**
 * A recorded stretch of time. A plank reads as 45 sec and a walk as 70 min;
 * writing 4200 sec would be pointless.
 */
export function formatSeconds(seconds: number): string {
  return seconds >= 120 ? `${Math.round(seconds / 60)} мин` : `${seconds} сек`;
}
