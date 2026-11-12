import { MAX_RANGE_DAYS, type ApiMap, type Bootstrap } from '../../shared/api.ts';
import { daysBetween, isIsoDate } from '../../shared/dates.ts';
import { AppError, ERR } from '../../shared/errors.ts';
import { normalizeDays } from '../../shared/status.ts';
import { entryKey } from '../../shared/week.ts';
import type { Entry, Member } from '../../shared/types.ts';
import type { Ctx } from '../context.ts';
import { PROP } from '../platform.ts';
import { fromEntry, toEntry } from '../repo/repo.ts';
import { ensureHolidayYears } from '../services/holidays.ts';

const stripPhone = ({ phone: _phone, ...m }: Member): Member => m;

export function bootstrap(ctx: Ctx, me: Member): Bootstrap {
  const members = ctx.repo.members();
  return {
    me,
    members: me.isAdmin ? members : members.map(stripPhone),
    statuses: ctx.repo.statuses(),
    vapidPublicKey: ctx.p.props.get(PROP.VAPID_PUBLIC_KEY) ?? '',
    pushTestEnabled: !!(ctx.p.props.get(PROP.GITHUB_REPO) && ctx.p.props.get(PROP.GITHUB_DISPATCH_TOKEN)),
  };
}

export function getRange(ctx: Ctx, req: ApiMap['getRange']['req']): ApiMap['getRange']['res'] {
  const { from, to } = req;
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) throw new AppError(ERR.BAD_REQUEST, 'טווח תאריכים לא תקין');
  if (daysBetween(from, to) > MAX_RANGE_DAYS) throw new AppError(ERR.BAD_REQUEST, `אפשר לבקש עד ${MAX_RANGE_DAYS} ימים`);
  ensureHolidayYears(ctx, from, to);
  return { entries: ctx.repo.entriesBetween(from, to), holidays: ctx.repo.holidaysBetween(from, to) };
}

const sameDay = (e: Entry | undefined, statusId: string, note: string) => (e?.statusId ?? '') === statusId && (e?.note ?? '') === note;

/**
 * Saves days for one member: yourself, or anyone if you are an admin. Unchanged days are skipped,
 * every real change is written to the log tab. Returns the stored rows for the requested dates.
 */
export function setDays(ctx: Ctx, me: Member, req: ApiMap['setDays']['req']): ApiMap['setDays']['res'] {
  const { memberId } = req;
  if (typeof memberId !== 'string') throw new AppError(ERR.BAD_REQUEST, 'חסר חבר צוות');
  if (memberId !== me.id && !me.isAdmin) throw new AppError(ERR.FORBIDDEN, 'אפשר לעדכן רק את הימים שלך');
  if (!ctx.repo.members().some((m) => m.id === memberId)) throw new AppError(ERR.NOT_FOUND, 'חבר הצוות לא נמצא');

  return ctx.locked(() => {
    const table = ctx.repo.t.entries;
    const indexByKey = new Map<string, number>();
    table.rows().forEach((r, i) => {
      if (r.memberId === memberId) indexByKey.set(entryKey(r.date ?? '', memberId), i);
    });
    const current = (date: string): Entry | undefined => {
      const i = indexByKey.get(entryKey(date, memberId));
      const row = i === undefined ? undefined : table.rows()[i];
      return row ? toEntry(row) : undefined;
    };

    const existingByDate = new Map<string, Entry>();
    for (const key of indexByKey.keys()) {
      const date = key.slice(0, 10);
      const e = current(date);
      if (e) existingByDate.set(date, e);
    }
    const days = normalizeDays(req.days, ctx.repo.statusMap(), existingByDate);

    const now = ctx.p.now().toISOString();
    const appended: Entry[] = [];
    const logs: Record<string, string>[] = [];
    for (const day of days) {
      const statusId = day.statusId ?? '';
      const before = existingByDate.get(day.date);
      if (sameDay(before, statusId, day.note)) continue;
      if (!before && !statusId) continue;
      const next: Entry = { date: day.date, memberId, statusId, note: day.note, updatedAt: now, updatedBy: me.id };
      const i = indexByKey.get(entryKey(day.date, memberId));
      if (i === undefined) appended.push(next);
      else table.update(i, fromEntry(next));
      logs.push({
        timestamp: now, actorId: me.id, memberId, date: day.date,
        before: before ? `${before.statusId}|${before.note}` : '', after: `${statusId}|${day.note}`,
      });
    }
    if (appended.length) table.append(appended.map(fromEntry));
    if (logs.length) ctx.repo.t.log.append(logs);

    const dates = new Set(days.map((d) => d.date));
    return {
      entries: table.rows().map(toEntry).filter((e) => e.memberId === memberId && dates.has(e.date)),
    };
  });
}
