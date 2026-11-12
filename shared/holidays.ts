import { isIsoDate } from './dates.ts';
import type { Holiday } from './types.ts';

/** The subset of a Hebcal JSON item we rely on (https://www.hebcal.com/home/195/jewish-calendar-rest-api). */
export interface HebcalItem {
  date?: string;
  hebrew?: string;
  title?: string;
  category?: string;
  subcat?: string;
  yomtov?: boolean;
}

/** National days that are days off but have no yomtov flag. */
const NATIONAL_DAYS_OFF = new Set(['יום העצמאות']);

/** Shown as a banner only (people usually work). */
const BANNER_DAYS = new Set(['פורים', 'תשעה באב', 'יום השואה', 'יום הזכרון']);

export const hebcalUrl = (year: number): string =>
  `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&mod=on&nx=off&ss=off&mf=off&c=off&s=off&i=on&lg=he&year=${year}&month=x`;

// Keeps what matters at work: chag days off, erev chag, chol hamoed and a few national days
export function parseHebcal(items: readonly HebcalItem[]): Holiday[] {
  const out: Holiday[] = [];
  for (const item of items) {
    const date = item.date?.slice(0, 10);
    const name = (item.hebrew ?? '').trim();
    if (!isIsoDate(date) || !name || item.category !== 'holiday') continue;
    const isErev = name.startsWith('ערב ') && item.subcat === 'major' && name !== 'ערב פורים';
    const isCholHamoed = name.includes('חוה״מ') || name.includes('הושענא רבה');
    const keep = item.yomtov === true || NATIONAL_DAYS_OFF.has(name) || BANNER_DAYS.has(name) || isErev || isCholHamoed;
    if (!keep) continue;
    out.push({ date, name, isDayOff: item.yomtov === true || NATIONAL_DAYS_OFF.has(name) });
  }
  return out;
}
