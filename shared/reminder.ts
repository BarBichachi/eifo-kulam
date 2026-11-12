import { formatWeekRange, israelClock, nextWeekStart } from './dates.ts';

/** Wednesday 07:30 Israel time. */
export const REMINDER_WEEKDAY = 3;
export const REMINDER_MINUTES = 7 * 60 + 30;
/** Earliest run that may wait for 07:30, and the latest late-run fallback. */
const WAIT_FROM_MINUTES = 7 * 60;
const LATE_UNTIL_MINUTES = 12 * 60;

export type ReminderDecision =
  | { action: 'skip'; reason: string }
  | { action: 'wait'; waitMs: number }
  | { action: 'send' };

/**
 * Two UTC crons cover both Israel offsets (UTC+2 / UTC+3). Each run decides:
 * before 07:00 IL (the off-DST run) skip, 07:00-07:30 wait, 07:30-12:00 send (late fallback included).
 */
export function reminderDecision(now: Date): ReminderDecision {
  const { weekday, minutes } = israelClock(now);
  if (weekday !== REMINDER_WEEKDAY) return { action: 'skip', reason: 'not Wednesday in Israel' };
  if (minutes < WAIT_FROM_MINUTES) return { action: 'skip', reason: 'too early (other DST run)' };
  if (minutes < REMINDER_MINUTES) {
    const waitMs = (REMINDER_MINUTES - minutes) * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds();
    return { action: 'wait', waitMs: Math.max(0, waitMs) };
  }
  if (minutes >= LATE_UNTIL_MINUTES) return { action: 'skip', reason: 'too late for a morning reminder' };
  return { action: 'send' };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Weekly reminder; tapping opens the editor on next week. */
export function reminderPayload(now: Date, appUrl: string): PushPayload & { week: string } {
  const week = nextWeekStart(israelClock(now).date);
  return {
    week,
    title: 'איפה כולם? 📍',
    body: `עדכנו איפה תהיו בשבוע הבא (${formatWeekRange(week)})`,
    url: `${appUrl}#/me/${week}`,
    tag: `reminder-${week}`,
  };
}

export function testPayload(appUrl: string): PushPayload {
  return {
    title: 'בדיקת התראות ✅',
    body: 'אם רואים את זה, ההתראות עובדות',
    url: `${appUrl}#/more`,
    tag: 'test',
  };
}
