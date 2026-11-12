import { describe, expect, it } from 'vitest';
import { PROP } from '../../backend/platform.ts';
import { ADMIN, ALICE, BOB, errorCode, world } from './world.ts';

const SVC = 'svc-token-'.padEnd(40, 'x');
const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: `p${n}`, auth: `a${n}` } });

describe('admin: members', () => {
  it('creates and edits members with normalized, unique phones', () => {
    const w = world();
    const token = w.loginAs(ADMIN);
    const { member } = w.ok('saveMember', { token, member: { name: '  New  Person ', phone: '052-111-2222', type: 'student', isAdmin: false, active: true } });
    expect(member).toMatchObject({ name: 'New Person', phone: '0521112222', type: 'student', order: 5 });
    expect(errorCode(w.call('saveMember', { token, member: { name: 'Dup', phone: ALICE.phone!, type: 'regular', isAdmin: false, active: true } }))).toBe('BAD_REQUEST');
    const edited = w.ok('saveMember', { token, member: { ...member, phone: member.phone!, name: 'Renamed' } }).member;
    expect(edited).toMatchObject({ id: member.id, name: 'Renamed', order: 5 });
  });

  it('cannot remove the last active admin', () => {
    const w = world();
    const token = w.loginAs(ADMIN);
    const res = w.call('saveMember', { token, member: { ...ADMIN, phone: ADMIN.phone!, isAdmin: false } });
    expect(errorCode(res)).toBe('BAD_REQUEST');
  });

  it('imports a roster by phone (create + update) with the service token', () => {
    const w = world([]);
    w.p.propsData.set(PROP.SERVICE_TOKEN, SVC);
    const first = w.ok('svcImportMembers', { token: SVC, members: [
      { name: 'A', phone: '0501111111', type: 'regular', isAdmin: false, active: true },
      { name: 'B', phone: '0502222222', type: 'student', isAdmin: true, active: true },
    ] });
    expect(first).toEqual({ created: 2, updated: 0 });
    const second = w.ok('svcImportMembers', { token: SVC, members: [{ name: 'A2', phone: '+972501111111', type: 'regular', isAdmin: false, active: true }] });
    expect(second).toEqual({ created: 0, updated: 1 });
    expect(w.tables.members!.data.map((r) => r.name)).toEqual(['A2', 'B']);
  });
});

describe('admin: statuses', () => {
  it('reorders members and statuses in one call', () => {
    const w = world();
    const token = w.loginAs(ADMIN);
    w.ok('reorder', { token, kind: 'members', ids: [BOB.id, ALICE.id, ADMIN.id] });
    expect(w.ok('bootstrap', { token }).members.slice(0, 3).map((m) => m.id)).toEqual([BOB.id, ALICE.id, ADMIN.id]);
    w.ok('reorder', { token, kind: 'statuses', ids: ['other', 'office'] });
    expect(w.ok('bootstrap', { token }).statuses.slice(0, 2).map((s) => s.id)).toEqual(['other', 'office']);
    expect(errorCode(w.call('reorder', { token, kind: 'log' as never, ids: [] }))).toBe('BAD_REQUEST');
    expect(errorCode(w.call('reorder', { token: w.loginAs(ALICE), kind: 'members', ids: [] }))).toBe('FORBIDDEN');
  });

  it('adds, edits and retires statuses with validation', () => {
    const w = world();
    const token = w.loginAs(ADMIN);
    const { status } = w.ok('saveStatus', { token, status: { label: 'מילואים פעיל', emoji: '🎖️', color: 'brown', category: 'off', requiresNote: false, active: true } });
    expect(status.order).toBe(13);
    w.ok('saveStatus', { token, status: { ...status, active: false } });
    expect(w.ok('bootstrap', { token }).statuses.find((s) => s.id === status.id)?.active).toBe(false);
    expect(errorCode(w.call('saveStatus', { token, status: { ...status, id: undefined, label: 'חופש' } }))).toBe('BAD_REQUEST');
    expect(errorCode(w.call('saveStatus', { token, status: { ...status, color: '#ff0000' } }))).toBe('BAD_REQUEST');
  });
});

describe('push', () => {
  it('subscribes per device, re-assigns an endpoint and caps devices', () => {
    const w = world();
    const alice = w.loginAs(ALICE);
    for (let i = 0; i < 12; i++) {
      w.p.clock = new Date(Date.UTC(2026, 10, 11, 8, i));
      w.ok('pushSubscribe', { token: alice, subscription: sub(i) });
    }
    expect(w.tables.push!.data).toHaveLength(10);
    expect(w.tables.push!.data.some((r) => r.endpoint === sub(0).endpoint)).toBe(false);
    w.ok('pushSubscribe', { token: w.loginAs(BOB), subscription: sub(11) });
    expect(w.tables.push!.data.find((r) => r.endpoint === sub(11).endpoint)?.memberId).toBe(BOB.id);
    expect(errorCode(w.call('pushSubscribe', { token: alice, subscription: { endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } } }))).toBe('BAD_REQUEST');
  });

  it('only removes your own subscription', () => {
    const w = world();
    w.ok('pushSubscribe', { token: w.loginAs(ALICE), subscription: sub(1) });
    w.ok('pushUnsubscribe', { token: w.loginAs(BOB), endpoint: sub(1).endpoint });
    expect(w.tables.push!.data).toHaveLength(1);
    w.ok('pushUnsubscribe', { token: w.loginAs(ALICE), endpoint: sub(1).endpoint });
    expect(w.tables.push!.data).toHaveLength(0);
  });

  it('service lists active members subs, records results and drops gone ones', () => {
    const w = world();
    w.p.propsData.set(PROP.SERVICE_TOKEN, SVC);
    w.ok('pushSubscribe', { token: w.loginAs(ALICE), subscription: sub(1) });
    w.ok('pushSubscribe', { token: w.loginAs(BOB), subscription: sub(2) });
    expect(w.ok('svcPushList', { token: SVC }).subscriptions).toHaveLength(2);
    expect(w.ok('svcPushList', { token: SVC, memberId: BOB.id }).subscriptions.map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
    const res = w.ok('svcPushReport', { token: SVC, results: [{ endpoint: sub(1).endpoint, status: 201 }, { endpoint: sub(2).endpoint, status: 410 }] });
    expect(res.removed).toBe(1);
    const coverage = w.ok('pushCoverage', { token: w.loginAs(ADMIN) }).coverage;
    expect(coverage).toEqual([{ memberId: ALICE.id, devices: 1, lastResult: '201', lastResultAt: expect.any(String) }]);
  });

  it('claims each reminder week once, and release allows a retry', () => {
    const w = world();
    w.p.propsData.set(PROP.SERVICE_TOKEN, SVC);
    const claim = (release?: boolean) => w.ok('svcReminderClaim', { token: SVC, week: '2026-11-22', release }).claimed;
    expect(claim()).toBe(true);
    expect(claim()).toBe(false);
    claim(true);
    expect(claim()).toBe(true);
  });

  it('test push: needs config, a subscription, and is rate limited', () => {
    const w = world();
    const alice = w.loginAs(ALICE);
    expect(errorCode(w.call('pushTest', { token: alice }))).toBe('NOT_CONFIGURED');
    w.p.propsData.set(PROP.GITHUB_REPO, 'owner/repo');
    w.p.propsData.set(PROP.GITHUB_DISPATCH_TOKEN, 'gh');
    expect(errorCode(w.call('pushTest', { token: alice }))).toBe('BAD_REQUEST');
    w.ok('pushSubscribe', { token: alice, subscription: sub(1) });
    w.p.fetchImpl = () => ({ status: 204, body: '' });
    w.ok('pushTest', { token: alice });
    expect(w.p.fetchCalls[0]!.url).toBe('https://api.github.com/repos/owner/repo/actions/workflows/reminder.yml/dispatches');
    expect(JSON.parse(w.p.fetchCalls[0]!.body!)).toEqual({ ref: 'main', inputs: { memberId: ALICE.id } });
    expect(errorCode(w.call('pushTest', { token: alice }))).toBe('RATE_LIMITED');
  });
});

describe('svcConfigure', () => {
  it('first call must set a token; later calls must present it', () => {
    const w = world();
    expect(errorCode(w.call('svcConfigure', { config: { vapidPublicKey: 'k' } }))).toBe('BAD_REQUEST');
    expect(w.ok('svcConfigure', { config: { serviceToken: SVC, vapidPublicKey: 'k' } }).configured).toEqual(['serviceToken', 'vapidPublicKey']);
    expect(errorCode(w.call('svcConfigure', { config: { vapidPublicKey: 'evil' } }))).toBe('UNAUTHORIZED');
    w.ok('svcConfigure', { token: SVC, config: { githubRepo: 'o/r' } });
    expect(w.p.propsData.get(PROP.VAPID_PUBLIC_KEY)).toBe('k');
    expect(w.p.propsData.get(PROP.GITHUB_REPO)).toBe('o/r');
  });
});
