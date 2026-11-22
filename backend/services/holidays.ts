import { hebcalUrl, parseHebcal, type HebcalItem } from '../../shared/holidays.ts';
import type { Ctx } from '../context.ts';

const YEARS_KEY = 'holidayYears';

/** Years whose holidays were already imported. */
function loadedYears(ctx: Ctx): Set<number> {
  return new Set((ctx.repo.setting(YEARS_KEY) ?? '').split(',').filter(Boolean).map(Number));
}

/** Holidays are imported only near the present; browsing far away just shows no holidays. */
const YEARS_BACK = 2;
const YEARS_AHEAD = 2;

/**
 * Lazily imports Hebcal holidays for each year in the range. Existing rows (including manual edits
 * to isDayOff) are never overwritten. A Hebcal outage is logged and retried on the next request.
 */
export function ensureHolidayYears(ctx: Ctx, from: string, to: string): void {
  const thisYear = Number(ctx.p.now().toISOString().slice(0, 4));
  const first = Math.max(Number(from.slice(0, 4)), thisYear - YEARS_BACK);
  const last = Math.min(Number(to.slice(0, 4)), thisYear + YEARS_AHEAD);
  const wanted: number[] = [];
  for (let y = first; y <= last; y++) wanted.push(y);
  const missing = wanted.filter((y) => !loadedYears(ctx).has(y));
  for (const year of missing) {
    try {
      const res = ctx.p.fetch(hebcalUrl(year));
      if (res.status !== 200) throw new Error(`Hebcal HTTP ${res.status}`);
      const items = (JSON.parse(res.body) as { items?: HebcalItem[] }).items ?? [];
      const holidays = parseHebcal(items);
      ctx.locked(() => {
        if (loadedYears(ctx).has(year)) return;
        const existing = new Set(ctx.repo.t.holidays.rows().map((r) => `${r.date}|${r.name}`));
        const rows = holidays
          .filter((h) => !existing.has(`${h.date}|${h.name}`))
          .map((h) => ({ date: h.date, name: h.name, isDayOff: h.isDayOff ? 'TRUE' : 'FALSE', source: 'hebcal' }));
        if (rows.length) ctx.repo.t.holidays.append(rows);
        ctx.repo.setSetting(YEARS_KEY, [...loadedYears(ctx), year].sort().join(','));
      });
    } catch (err) {
      ctx.p.log(`Holiday import failed for ${year}`, err);
    }
  }
}
