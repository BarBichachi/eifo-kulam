import { addDays, dateRange, isWorkDay, workDays } from './dates.ts';
import { effectiveDay, isFilled, resolveStatus, sortMembers } from './status.ts';
import type { Category, DayInput, EffectiveDay, Entry, Holiday, Member, Status } from './types.ts';

export type EntryIndex = ReadonlyMap<string, Entry>;
export type HolidayIndex = ReadonlyMap<string, Holiday>;

export const entryKey = (date: string, memberId: string): string => `${date}|${memberId}`;

export function indexEntries(entries: readonly Entry[]): Map<string, Entry> {
  return new Map(entries.map((e) => [entryKey(e.date, e.memberId), e]));
}

export function indexHolidays(holidays: readonly Holiday[]): Map<string, Holiday> {
  const map = new Map<string, Holiday>();
  for (const h of holidays) {
    const prev = map.get(h.date);
    // Two holidays on one date: keep the day-off one and join names
    map.set(h.date, prev ? { date: h.date, name: `${prev.name}, ${h.name}`, isDayOff: prev.isDayOff || h.isDayOff } : h);
  }
  return map;
}

export interface DayCell {
  member: Member;
  day: EffectiveDay;
  status: Status;
}

/** Every active member's resolved status for one date, in roster order. */
export function dayCells(
  members: readonly Member[],
  date: string,
  entries: EntryIndex,
  holidays: HolidayIndex,
  statuses: ReadonlyMap<string, Status>,
): DayCell[] {
  const holiday = holidays.get(date);
  return sortMembers(members.filter((m) => m.active)).map((member) => {
    const day = effectiveDay(member, entries.get(entryKey(date, member.id)), holiday);
    return { member, day, status: resolveStatus(statuses, day.statusId) };
  });
}

/** People in the office that day. */
export function headcount(cells: readonly DayCell[]): number {
  return cells.filter((c) => c.status.category === 'office').length;
}

export function groupByCategory(cells: readonly DayCell[]): Record<Category, DayCell[]> {
  const groups: Record<Category, DayCell[]> = { office: [], elsewhere: [], off: [] };
  for (const c of cells) groups[c.status.category].push(c);
  return groups;
}

/** Work days of the week that are not day-off holidays. */
export function fillableDays(ws: string, holidays: HolidayIndex): string[] {
  return workDays(ws).filter((d) => !holidays.get(d)?.isDayOff);
}

/** Active members who did not set any day of the week (a confirmed "in office" counts as set). */
export function notFilled(members: readonly Member[], ws: string, entries: EntryIndex, holidays: HolidayIndex): Member[] {
  const days = fillableDays(ws, holidays);
  if (days.length === 0) return [];
  return sortMembers(members.filter((m) => m.active)).filter(
    (m) => !days.some((d) => isFilled(entries.get(entryKey(d, m.id)))),
  );
}

/** Mirrors last week's explicit days onto the target week; day-off holidays in the target are left alone. */
export function copyWeekDays(memberId: string, fromWs: string, toWs: string, entries: EntryIndex, holidays: HolidayIndex): DayInput[] {
  return workDays(toWs)
    .map((date, i) => ({ date, src: entries.get(entryKey(addDays(fromWs, i), memberId)) }))
    .filter(({ date }) => !holidays.get(date)?.isDayOff)
    .map(({ date, src }) =>
      isFilled(src) ? { date, statusId: src.statusId, note: src.note } : { date, statusId: null, note: '' },
    );
}

/** Same status on every work day in from..to, skipping Fri/Sat and day-off holidays. */
export function rangeDays(from: string, to: string, holidays: HolidayIndex, statusId: string | null, note: string): DayInput[] {
  if (to < from) return [];
  return dateRange(from, to)
    .filter((d) => isWorkDay(d) && !holidays.get(d)?.isDayOff)
    .map((date) => ({ date, statusId, note }));
}

/** Same status on every fillable day of one week. */
export function wholeWeekDays(ws: string, holidays: HolidayIndex, statusId: string | null, note = ''): DayInput[] {
  return fillableDays(ws, holidays).map((date) => ({ date, statusId, note }));
}
