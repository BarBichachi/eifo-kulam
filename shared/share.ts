import { formatDayShort, formatWeekRange, workDays } from './dates.ts';
import { dayCells, headcount, type EntryIndex, type HolidayIndex } from './week.ts';
import type { Member, Status } from './types.ts';

/** Statuses that are noise in a summary (students not coming is the normal case). */
const QUIET_STATUS_IDS = new Set(['not_coming']);

/**
 * WhatsApp-friendly week summary: per day, the office headcount and everyone who is not in the office.
 * Uses WhatsApp markdown (*bold*).
 */
export function weekSummaryText(
  ws: string,
  members: readonly Member[],
  statuses: ReadonlyMap<string, Status>,
  entries: EntryIndex,
  holidays: HolidayIndex,
  appUrl: string,
): string {
  const lines = [`📍 *איפה כולם - שבוע ${formatWeekRange(ws)}*`];
  for (const date of workDays(ws)) {
    const holiday = holidays.get(date);
    const cells = dayCells(members, date, entries, holidays, statuses);
    lines.push('', `*${formatDayShort(date)}*${holiday ? ` (${holiday.name})` : ''} | במשרד: ${headcount(cells)}`);
    for (const c of cells) {
      if (c.status.category === 'office' || c.day.source === 'holiday' || QUIET_STATUS_IDS.has(c.status.id)) continue;
      const note = c.day.note ? ` - ${c.day.note}` : '';
      lines.push(`${c.status.emoji} ${c.member.name}: ${c.status.label}${note}`);
    }
  }
  lines.push('', `לעדכון: ${appUrl}`);
  return lines.join('\n');
}

/** Friendly nudge listing who has not filled the given week yet. */
export function reminderText(ws: string, missing: readonly Member[], appUrl: string): string {
  const head = `⏰ תזכורת: לעדכן איפה תהיו בשבוע ${formatWeekRange(ws)}`;
  const who = missing.length ? `\nעוד לא עדכנו: ${missing.map((m) => m.name).join(', ')}` : '';
  return `${head}${who}\n${appUrl}`;
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
