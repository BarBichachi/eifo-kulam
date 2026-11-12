import type { Entry, Holiday, Member, Status } from '../shared/types.ts';
import { SEED_STATUSES } from '../shared/statuses.ts';

// Shared test fixtures: fake people only

export function member(id: string, over: Partial<Member> = {}): Member {
  return { id, name: `name-${id}`, type: 'regular', isAdmin: false, active: true, order: 1, ...over };
}

export function entry(date: string, memberId: string, statusId: string, note = ''): Entry {
  return { date, memberId, statusId, note, updatedAt: '2026-11-01T00:00:00.000Z', updatedBy: memberId };
}

export function holiday(date: string, name: string, isDayOff = true): Holiday {
  return { date, name, isDayOff };
}

export function statusMap(extra: Status[] = []): Map<string, Status> {
  return new Map([...SEED_STATUSES, ...extra].map((s) => [s.id, s]));
}
