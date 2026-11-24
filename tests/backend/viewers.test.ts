import { describe, expect, it } from 'vitest';
import { ADMIN, ALICE, BOB, errorCode, world, type World } from './world.ts';

const SUN = '2026-11-15';
const VIEWER_PHONE = '0529998877';

/** Admin adds a viewer and the viewer logs in; returns both tokens and the viewer id. */
function withViewer(w: World) {
  const admin = w.loginAs(ADMIN);
  const { viewer } = w.ok('saveViewer', { token: admin, viewer: { name: ' Guest  Manager ', phone: '052-999-8877' } });
  const login = w.ok('login', { phone: VIEWER_PHONE, from: SUN, to: '2026-11-21' });
  return { admin, viewer, token: login.token, login };
}

describe('viewers: admin', () => {
  it('adds, lists, edits and deletes viewers; only admins can', () => {
    const w = world();
    const { admin, viewer } = withViewer(w);
    expect(viewer).toMatchObject({ name: 'Guest Manager', phone: VIEWER_PHONE, createdAt: w.p.clock.toISOString() });
    expect(viewer.id).toMatch(/^v/);
    expect(w.ok('adminViewers', { token: admin }).viewers).toEqual([viewer]);

    const edited = w.ok('saveViewer', { token: admin, viewer: { id: viewer.id, name: 'Renamed', phone: VIEWER_PHONE } }).viewer;
    expect(edited).toMatchObject({ id: viewer.id, name: 'Renamed', createdAt: viewer.createdAt });
    expect(w.tables.viewers!.data).toHaveLength(1);

    const alice = w.loginAs(ALICE);
    expect(errorCode(w.call('adminViewers', { token: alice }))).toBe('FORBIDDEN');
    expect(errorCode(w.call('saveViewer', { token: alice, viewer: { name: 'X', phone: '0521234567' } }))).toBe('FORBIDDEN');
    expect(errorCode(w.call('deleteViewer', { token: alice, viewerId: viewer.id }))).toBe('FORBIDDEN');

    expect(errorCode(w.call('deleteViewer', { token: admin, viewerId: 'v-missing' }))).toBe('NOT_FOUND');
    expect(errorCode(w.call('saveViewer', { token: admin, viewer: { id: 'v-missing', name: 'X', phone: '0521234567' } }))).toBe('NOT_FOUND');
  });

  it('keeps login phones unique across members and viewers', () => {
    const w = world();
    const { admin, viewer } = withViewer(w);
    expect(errorCode(w.call('saveViewer', { token: admin, viewer: { name: 'Dup', phone: ALICE.phone! } }))).toBe('BAD_REQUEST');
    expect(errorCode(w.call('saveViewer', { token: admin, viewer: { name: 'Dup', phone: VIEWER_PHONE } }))).toBe('BAD_REQUEST');
    const asMember = w.call('saveMember', { token: admin, member: { name: 'Dup', phone: VIEWER_PHONE, type: 'regular', isAdmin: false, active: true } });
    expect(errorCode(asMember)).toBe('BAD_REQUEST');
    expect(errorCode(w.call('saveViewer', { token: admin, viewer: { name: 'Bad', phone: '123' } }))).toBe('BAD_REQUEST');
    expect(errorCode(w.call('saveViewer', { token: admin, viewer: { name: '  ', phone: '0521234567' } }))).toBe('BAD_REQUEST');
    // Saving a viewer with their own phone is not a conflict
    expect(w.call('saveViewer', { token: admin, viewer: { id: viewer.id, name: 'Same', phone: VIEWER_PHONE } }).ok).toBe(true);
  });

  it('deleting a viewer signs them out everywhere', () => {
    const w = world();
    const { admin, viewer, token } = withViewer(w);
    w.ok('login', { phone: VIEWER_PHONE });
    expect(w.ok('deleteViewer', { token: admin, viewerId: viewer.id }).revoked).toBe(2);
    expect(errorCode(w.call('bootstrap', { token }))).toBe('UNAUTHORIZED');
    expect(errorCode(w.call('login', { phone: VIEWER_PHONE }))).toBe('UNKNOWN_PHONE');
  });
});

describe('viewers: read-only access', () => {
  it('logs in by phone and sees the roster and weeks without phones, and is not on the roster', () => {
    const w = world();
    w.ok('setDays', { token: w.loginAs(ALICE), memberId: ALICE.id, days: [{ date: SUN, statusId: 'home', note: '' }] });
    const { viewer, token, login } = withViewer(w);

    expect(login.me).toMatchObject({ id: viewer.id, name: 'Guest Manager', readOnly: true, isAdmin: false });
    expect(login.boot?.me.readOnly).toBe(true);
    expect(login.boot?.members.map((m) => m.id)).not.toContain(viewer.id);
    expect(login.boot?.members.every((m) => m.phone === undefined)).toBe(true);
    expect(login.range?.entries.map((e) => e.memberId)).toEqual([ALICE.id]);

    w.p.cacheData.clear();
    expect(w.ok('bootstrap', { token }).me.readOnly).toBe(true);
    expect(w.ok('getRange', { token, from: SUN, to: '2026-11-21' }).entries).toHaveLength(1);
  });

  it('cannot change days, use push or call admin actions', () => {
    const w = world();
    const { token, viewer } = withViewer(w);
    const days = [{ date: SUN, statusId: 'home', note: '' }];
    expect(errorCode(w.call('setDays', { token, memberId: viewer.id, days }))).toBe('FORBIDDEN');
    expect(errorCode(w.call('setDays', { token, memberId: BOB.id, days }))).toBe('FORBIDDEN');
    const subscription = { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } };
    expect(errorCode(w.call('pushSubscribe', { token, subscription }))).toBe('FORBIDDEN');
    expect(errorCode(w.call('pushTest', { token }))).toBe('FORBIDDEN');
    expect(errorCode(w.call('adminMembers', { token }))).toBe('FORBIDDEN');
    expect(w.tables.entries!.data).toHaveLength(0);
    expect(w.tables.push!.data).toHaveLength(0);
  });

  it('a team member with the same phone wins over a viewer row added by hand', () => {
    const w = world();
    w.tables.viewers!.append([{ id: 'v-hand', name: 'Hand', phone: ALICE.phone!, createdAt: '' }]);
    expect(w.ok('login', { phone: ALICE.phone! }).me).toMatchObject({ id: ALICE.id });
  });
});
