import { isIsoDate, isWorkDay } from './dates.ts';
import { AppError, ERR } from './errors.ts';
import { DEFAULT_STATUS, HOLIDAY_STATUS, HOLIDAY_STATUS_ID, NOTE_MAX, OTHER_STATUS_ID, unknownStatus } from './statuses.ts';
import type { DayInput, EffectiveDay, Entry, Holiday, Member, Status } from './types.ts';

/** Max days in one save (a year of range fill). */
export const MAX_DAYS_PER_SAVE = 370;

/** A stored entry counts only if it carries a status (cleared rows keep an empty statusId). */
export function isFilled(entry: Entry | undefined): entry is Entry {
  return !!entry && entry.statusId !== '';
}

// Resolution order: explicit entry, then a day-off holiday, then the member type default
export function effectiveDay(member: Member, entry: Entry | undefined, holiday: Holiday | undefined): EffectiveDay {
  if (isFilled(entry)) return { statusId: entry.statusId, note: entry.note, source: 'entry' };
  if (holiday?.isDayOff) return { statusId: HOLIDAY_STATUS_ID, note: holiday.name, source: 'holiday' };
  return { statusId: DEFAULT_STATUS[member.type], note: '', source: 'default' };
}

/** Looks up a status for display; never fails, so renamed/removed ids still render. */
export function resolveStatus(statuses: ReadonlyMap<string, Status>, id: string): Status {
  if (id === HOLIDAY_STATUS_ID) return HOLIDAY_STATUS;
  return statuses.get(id) ?? unknownStatus(id);
}

export function sortStatuses(statuses: Status[]): Status[] {
  return [...statuses].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'he'));
}

export function sortMembers(members: Member[]): Member[] {
  return [...members].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'he'));
}

function bad(message: string): never {
  throw new AppError(ERR.BAD_REQUEST, message);
}

/**
 * Validates and normalizes a batch of day changes.
 * - Sun-Thu ISO dates only, no duplicates.
 * - A note without a status becomes "other"; "other" (and any requiresNote status) needs a note.
 * - Retired statuses are rejected unless the day already has that status (unchanged re-save).
 */
export function normalizeDays(
  input: unknown,
  statuses: ReadonlyMap<string, Status>,
  existing: ReadonlyMap<string, Entry>,
): DayInput[] {
  if (!Array.isArray(input) || input.length === 0) bad('לא נשלחו ימים לעדכון');
  if (input.length > MAX_DAYS_PER_SAVE) bad(`אפשר לעדכן עד ${MAX_DAYS_PER_SAVE} ימים בפעם אחת`);
  const seen = new Set<string>();
  return input.map((raw: unknown) => {
    const day = (raw ?? {}) as Partial<Record<keyof DayInput, unknown>>;
    if (!isIsoDate(day.date)) bad('תאריך לא תקין');
    const date = day.date;
    if (!isWorkDay(date)) bad(`${date} הוא סוף שבוע`);
    if (seen.has(date)) bad(`התאריך ${date} מופיע פעמיים`);
    seen.add(date);

    const note = typeof day.note === 'string' ? day.note.trim().replace(/\s+/g, ' ') : '';
    if (note.length > NOTE_MAX) bad(`ההערה ארוכה מדי (עד ${NOTE_MAX} תווים)`);
    let statusId = typeof day.statusId === 'string' && day.statusId !== '' ? day.statusId : null;
    if (statusId === null && note) statusId = OTHER_STATUS_ID;
    if (statusId === null) return { date, statusId: null, note: '' };

    const status = statuses.get(statusId);
    if (!status) bad('סטטוס לא קיים');
    if (!status.active && existing.get(date)?.statusId !== statusId) bad(`הסטטוס "${status.label}" כבר לא בשימוש`);
    if (status.requiresNote && !note) bad(`בסטטוס "${status.label}" צריך לכתוב הערה`);
    return { date, statusId, note };
  });
}
