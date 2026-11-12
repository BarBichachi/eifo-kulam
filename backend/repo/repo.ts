import type { Category, Entry, Holiday, Member, MemberType, Status } from '../../shared/types.ts';
import type { PushSub } from '../../shared/api.ts';
import { sortMembers, sortStatuses } from '../../shared/status.ts';
import { normalizePhone } from '../../shared/phone.ts';
import { bool, boolStr, type Row, type Table } from './table.ts';
import type { TableName } from './schema.ts';

export type Tables = Record<TableName, Table>;

export interface PushRow extends PushSub {
  createdAt: string;
  lastResult: string;
  lastResultAt: string;
}

const num = (v: string | undefined, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' ? n : fallback;
};

export const toMember = (r: Row): Member => ({
  id: r.id ?? '',
  name: (r.name ?? '').trim(),
  phone: normalizePhone(r.phone ?? '') ?? '',
  type: (r.type === 'student' ? 'student' : 'regular') as MemberType,
  isAdmin: bool(r.isAdmin),
  active: r.active === undefined || r.active === '' ? true : bool(r.active),
  order: num(r.order, 999),
});

export const fromMember = (m: Member): Row => ({
  id: m.id, name: m.name, phone: m.phone ?? '', type: m.type,
  isAdmin: boolStr(m.isAdmin), active: boolStr(m.active), order: String(m.order),
});

const CATEGORIES = new Set<Category>(['office', 'elsewhere', 'off']);

export const toStatus = (r: Row): Status => ({
  id: r.id ?? '',
  label: (r.label ?? '').trim(),
  emoji: (r.emoji ?? '').trim(),
  color: r.color || 'gray',
  category: CATEGORIES.has(r.category as Category) ? (r.category as Category) : 'elsewhere',
  requiresNote: bool(r.requiresNote),
  active: r.active === undefined || r.active === '' ? true : bool(r.active),
  order: num(r.order, 999),
});

export const fromStatus = (s: Status): Row => ({
  id: s.id, label: s.label, emoji: s.emoji, color: s.color, category: s.category,
  requiresNote: boolStr(s.requiresNote), active: boolStr(s.active), order: String(s.order),
});

export const toEntry = (r: Row): Entry => ({
  date: r.date ?? '', memberId: r.memberId ?? '', statusId: r.statusId ?? '', note: r.note ?? '',
  updatedAt: r.updatedAt ?? '', updatedBy: r.updatedBy ?? '',
});

export const fromEntry = (e: Entry): Row => ({ ...e });

export const toHoliday = (r: Row): Holiday => ({ date: r.date ?? '', name: (r.name ?? '').trim(), isDayOff: bool(r.isDayOff) });

export const toPush = (r: Row): PushRow => ({
  memberId: r.memberId ?? '', endpoint: r.endpoint ?? '', p256dh: r.p256dh ?? '', auth: r.auth ?? '',
  createdAt: r.createdAt ?? '', lastResult: r.lastResult ?? '', lastResultAt: r.lastResultAt ?? '',
});

/** Typed access over the raw tables. Created per request. */
export class Repo {
  readonly t: Tables;

  constructor(tables: Tables) {
    this.t = tables;
  }

  invalidate(): void {
    for (const table of Object.values(this.t)) table.invalidate();
  }

  members(): Member[] {
    return sortMembers(this.t.members.rows().map(toMember).filter((m) => m.id && m.name));
  }

  statuses(): Status[] {
    return sortStatuses(this.t.statuses.rows().map(toStatus).filter((s) => s.id && s.label));
  }

  statusMap(): Map<string, Status> {
    return new Map(this.statuses().map((s) => [s.id, s]));
  }

  /** Filled entries with from <= date <= to. */
  entriesBetween(from: string, to: string): Entry[] {
    return this.t.entries.rows().map(toEntry).filter((e) => e.statusId && e.date >= from && e.date <= to);
  }

  holidaysBetween(from: string, to: string): Holiday[] {
    return this.t.holidays.rows().map(toHoliday).filter((h) => h.name && h.date >= from && h.date <= to);
  }

  setting(key: string): string | null {
    return this.t.settings.rows().find((r) => r.key === key)?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    const i = this.t.settings.rows().findIndex((r) => r.key === key);
    if (i >= 0) this.t.settings.update(i, { key, value });
    else this.t.settings.append([{ key, value }]);
  }
}
