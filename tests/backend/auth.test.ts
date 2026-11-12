import { describe, expect, it } from 'vitest';
import { PROP } from '../../backend/platform.ts';
import { handle } from '../../backend/router.ts';
import { ADMIN, ALICE, BOB, GONE, errorCode, world } from './world.ts';

describe('auth', () => {
  it('logs in by phone in any common format and returns a token', () => {
    const w = world();
    const res = w.ok('login', { phone: '+972 50-000-0002' });
    expect(res.me.id).toBe(ALICE.id);
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);
    expect(w.tables.sessions!.data).toHaveLength(1);
    expect(w.tables.sessions!.data[0]!.tokenHash).not.toBe(res.token);
  });

  it('rejects unknown, inactive and malformed phones', () => {
    const w = world();
    expect(errorCode(w.call('login', { phone: '0509999999' }))).toBe('UNKNOWN_PHONE');
    expect(errorCode(w.call('login', { phone: GONE.phone! }))).toBe('UNKNOWN_PHONE');
    expect(errorCode(w.call('login', { phone: '123' }))).toBe('BAD_REQUEST');
  });

  it('throttles after many failed logins', () => {
    const w = world();
    for (let i = 0; i < 60; i++) w.call('login', { phone: '0509999999' });
    expect(errorCode(w.call('login', { phone: ALICE.phone! }))).toBe('RATE_LIMITED');
  });

  it('authenticates from the sheet when the cache is cold, and logout ends the session', () => {
    const w = world();
    const token = w.loginAs(ALICE);
    w.p.cacheData.clear();
    expect(w.ok('bootstrap', { token }).me.id).toBe(ALICE.id);
    w.ok('logout', { token });
    expect(w.tables.sessions!.data).toHaveLength(0);
    expect(errorCode(w.call('bootstrap', { token }))).toBe('UNAUTHORIZED');
  });

  it('rejects sessions of members who were deactivated', () => {
    const w = world();
    const token = w.loginAs(ALICE);
    const i = w.tables.members!.data.findIndex((r) => r.id === ALICE.id);
    w.tables.members!.data[i]!.active = 'FALSE';
    expect(errorCode(w.call('bootstrap', { token }))).toBe('UNAUTHORIZED');
  });

  it('admin can revoke all sessions of a member', () => {
    const w = world();
    const alice1 = w.loginAs(ALICE);
    w.loginAs(ALICE);
    const admin = w.loginAs(ADMIN);
    expect(w.ok('revokeSessions', { token: admin, memberId: ALICE.id }).revoked).toBe(2);
    expect(errorCode(w.call('bootstrap', { token: alice1 }))).toBe('UNAUTHORIZED');
  });

  it('service actions need the service token', () => {
    const w = world();
    expect(errorCode(w.call('svcPushList', {}))).toBe('UNAUTHORIZED');
    w.p.propsData.set(PROP.SERVICE_TOKEN, 's'.repeat(40));
    expect(w.call('svcPushList', { token: 's'.repeat(40) }).ok).toBe(true);
    expect(errorCode(w.call('svcPushList', { token: 'x'.repeat(40) }))).toBe('UNAUTHORIZED');
  });
});

describe('router', () => {
  it('handles bad JSON, unknown actions and prototype keys', () => {
    const w = world();
    expect(errorCode(handle(w.ctx, '{nope'))).toBe('BAD_REQUEST');
    expect(errorCode(w.call('nope' as never, {} as never))).toBe('BAD_REQUEST');
    expect(errorCode(w.call('toString' as never, {} as never))).toBe('BAD_REQUEST');
  });

  it('hides internal errors behind a generic message and logs them', () => {
    const w = world();
    const token = w.loginAs(ALICE);
    w.tables.entries!.rows = () => {
      throw new Error('sheet exploded');
    };
    const res = w.call('getRange', { token, from: '2026-11-15', to: '2026-11-21' });
    expect(errorCode(res)).toBe('INTERNAL');
    expect(w.p.logs.join()).toContain('getRange');
  });

  it('admin-only actions are forbidden for members', () => {
    const w = world();
    expect(errorCode(w.call('adminMembers', { token: w.loginAs(BOB) }))).toBe('FORBIDDEN');
  });
});
