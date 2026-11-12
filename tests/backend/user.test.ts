import { describe, expect, it } from 'vitest';
import { ADMIN, ALICE, BOB, errorCode, world } from './world.ts';

const SUN = '2026-11-15';
const MON = '2026-11-16';

describe('bootstrap', () => {
  it('strips phones for members and keeps them for admins', () => {
    const w = world();
    const member = w.ok('bootstrap', { token: w.loginAs(ALICE) });
    expect(member.me.phone).toBe(ALICE.phone);
    expect(member.members.every((m) => m.phone === undefined)).toBe(true);
    expect(member.statuses).toHaveLength(12);
    const admin = w.ok('bootstrap', { token: w.loginAs(ADMIN) });
    expect(admin.members.find((m) => m.id === ALICE.id)?.phone).toBe(ALICE.phone);
  });
});

describe('setDays', () => {
  it('saves own days, skips no-ops and logs every change', () => {
    const w = world();
    const token = w.loginAs(ALICE);
    const res = w.ok('setDays', { token, memberId: ALICE.id, days: [
      { date: SUN, statusId: 'vacation', note: '' },
      { date: MON, statusId: null, note: 'dentist' },
    ] });
    expect(res.entries.map((e) => [e.date, e.statusId, e.note])).toEqual([[SUN, 'vacation', ''], [MON, 'other', 'dentist']]);
    expect(w.tables.log!.data).toHaveLength(2);

    w.ok('setDays', { token, memberId: ALICE.id, days: [{ date: SUN, statusId: 'vacation', note: '' }] });
    expect(w.tables.log!.data).toHaveLength(2);
    expect(w.tables.entries!.data).toHaveLength(2);
  });

  it('updates in place and clears a day back to default', () => {
    const w = world();
    const token = w.loginAs(ALICE);
    w.ok('setDays', { token, memberId: ALICE.id, days: [{ date: SUN, statusId: 'home', note: '' }] });
    w.ok('setDays', { token, memberId: ALICE.id, days: [{ date: SUN, statusId: 'sick', note: '' }] });
    expect(w.tables.entries!.data.map((r) => r.statusId)).toEqual(['sick']);
    w.ok('setDays', { token, memberId: ALICE.id, days: [{ date: SUN, statusId: null, note: '' }] });
    expect(w.tables.entries!.data.map((r) => r.statusId)).toEqual(['']);
    expect(w.tables.log!.data.at(-1)).toMatchObject({ before: 'sick|', after: '|' });
    const range = w.ok('getRange', { token, from: SUN, to: '2026-11-21' });
    expect(range.entries).toEqual([]);
  });

  it('does not create rows when clearing an untouched day', () => {
    const w = world();
    const token = w.loginAs(ALICE);
    w.ok('setDays', { token, memberId: ALICE.id, days: [{ date: SUN, statusId: null, note: '' }] });
    expect(w.tables.entries!.data).toHaveLength(0);
  });

  it('members cannot edit others; admins can', () => {
    const w = world();
    expect(errorCode(w.call('setDays', { token: w.loginAs(ALICE), memberId: BOB.id, days: [{ date: SUN, statusId: 'office', note: '' }] }))).toBe('FORBIDDEN');
    const res = w.ok('setDays', { token: w.loginAs(ADMIN), memberId: BOB.id, days: [{ date: SUN, statusId: 'office', note: '' }] });
    expect(res.entries[0]).toMatchObject({ memberId: BOB.id, updatedBy: ADMIN.id });
  });

  it('validates input and unknown members', () => {
    const w = world();
    const admin = w.loginAs(ADMIN);
    expect(errorCode(w.call('setDays', { token: admin, memberId: 'nobody', days: [{ date: SUN, statusId: 'office', note: '' }] }))).toBe('NOT_FOUND');
    expect(errorCode(w.call('setDays', { token: admin, memberId: ADMIN.id, days: [{ date: '2026-11-20', statusId: 'office', note: '' }] }))).toBe('BAD_REQUEST');
    expect(errorCode(w.call('setDays', { token: admin, memberId: ADMIN.id, days: [{ date: SUN, statusId: 'other', note: '' }] }))).toBe('BAD_REQUEST');
  });

  it('keeps other members rows untouched', () => {
    const w = world();
    w.ok('setDays', { token: w.loginAs(BOB), memberId: BOB.id, days: [{ date: SUN, statusId: 'study', note: '' }] });
    w.ok('setDays', { token: w.loginAs(ALICE), memberId: ALICE.id, days: [{ date: SUN, statusId: 'home', note: '' }] });
    expect(w.tables.entries!.data.map((r) => `${r.memberId}:${r.statusId}`)).toEqual([`${BOB.id}:study`, `${ALICE.id}:home`]);
  });
});

describe('getRange', () => {
  it('returns filled entries in range and imports holidays once per year', () => {
    const w = world();
    w.p.fetchImpl = () => ({
      status: 200,
      body: JSON.stringify({ items: [
        { date: '2026-12-01', hebrew: 'פסח א׳', category: 'holiday', subcat: 'major', yomtov: true },
        { date: '2026-11-17', hebrew: 'ערב פסח', category: 'holiday', subcat: 'major' },
      ] }),
    });
    const token = w.loginAs(ALICE);
    w.ok('setDays', { token, memberId: ALICE.id, days: [{ date: SUN, statusId: 'home', note: '' }, { date: '2026-11-22', statusId: 'home', note: '' }] });
    const res = w.ok('getRange', { token, from: SUN, to: '2026-11-21' });
    expect(res.entries.map((e) => e.date)).toEqual([SUN]);
    expect(res.holidays).toEqual([{ date: '2026-11-17', name: 'ערב פסח', isDayOff: false }]);
    w.ok('getRange', { token, from: SUN, to: '2026-11-21' });
    expect(w.p.fetchCalls).toHaveLength(1);
    expect(w.tables.holidays!.data).toHaveLength(2);
  });

  it('keeps working (without holidays) when Hebcal is down, and retries later', () => {
    const w = world();
    w.p.fetchImpl = () => ({ status: 503, body: '' });
    const token = w.loginAs(ALICE);
    expect(w.ok('getRange', { token, from: SUN, to: '2026-11-21' }).holidays).toEqual([]);
    w.ok('getRange', { token, from: SUN, to: '2026-11-21' });
    expect(w.p.fetchCalls).toHaveLength(2);
  });

  it('rejects bad and oversized ranges', () => {
    const w = world();
    const token = w.loginAs(ALICE);
    expect(errorCode(w.call('getRange', { token, from: '2026-11-21', to: SUN }))).toBe('BAD_REQUEST');
    expect(errorCode(w.call('getRange', { token, from: '2025-01-01', to: '2026-12-31' }))).toBe('BAD_REQUEST');
  });
});
