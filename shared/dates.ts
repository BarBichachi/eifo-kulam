// Date-only helpers. Dates are ISO strings (YYYY-MM-DD) handled in UTC so time zones never shift a day.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const HE_DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;
export const HE_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

// Strict ISO date check, including impossible dates like 2026-02-30
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function toUtc(iso: string): Date {
  if (!isIsoDate(iso)) throw new Error(`Invalid ISO date: ${String(iso)}`);
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return toUtc(iso).getUTCDay();
}

/** Sunday-Thursday */
export function isWorkDay(iso: string): boolean {
  return dayOfWeek(iso) <= 4;
}

/** The Sunday that starts the week containing iso. */
export function weekStart(iso: string): string {
  return addDays(iso, -dayOfWeek(iso));
}

/** Sunday-Thursday of the week starting at ws. */
export function workDays(ws: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(ws, i));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

/** Every date from..to inclusive. */
export function dateRange(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  const out: string[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** Calendar parts of an instant in Israel time (handles DST via Intl). */
export function israelClock(now: Date): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, weekday: dayOfWeek(date), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function israelToday(now: Date = new Date()): string {
  return israelClock(now).date;
}

/** The Sunday of the next week (on Fri/Sat this is the coming Sunday). */
export function nextWeekStart(today: string): string {
  return addDays(weekStart(today), 7);
}

/** Today if it is a work day, otherwise the next work day. */
export function nearestWorkDay(iso: string): string {
  let d = iso;
  while (!isWorkDay(d)) d = addDays(d, 1);
  return d;
}

/** Steps over Fri/Sat in either direction. */
export function shiftWorkDay(iso: string, step: 1 | -1): string {
  let d = addDays(iso, step);
  while (!isWorkDay(d)) d = addDays(d, step);
  return d;
}

/** 15.11 */
export function formatShort(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** 15.11.2026 */
export function formatFull(iso: string): string {
  return `${formatShort(iso)}.${iso.slice(0, 4)}`;
}

/** א׳ 15.11 */
export function formatDayShort(iso: string): string {
  return `${HE_DAY_LETTERS[dayOfWeek(iso)]} ${formatShort(iso)}`;
}

/** יום ראשון, 15.11.2026 */
export function formatDayLong(iso: string): string {
  return `יום ${HE_DAY_NAMES[dayOfWeek(iso)]}, ${formatFull(iso)}`;
}

/** 15.11 - 19.11 */
export function formatWeekRange(ws: string): string {
  return `${formatShort(ws)} - ${formatShort(addDays(ws, 4))}`;
}
