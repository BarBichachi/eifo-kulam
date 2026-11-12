import { createHash, randomUUID } from 'node:crypto';
import { makeCtx, type Ctx } from '../../backend/context.ts';
import type { Platform } from '../../backend/platform.ts';
import { fromMember, fromStatus, Repo, type Tables } from '../../backend/repo/repo.ts';
import { TABLE_NAMES } from '../../backend/repo/schema.ts';
import { MemoryTable } from '../../backend/repo/table.ts';
import { handle } from '../../backend/router.ts';
import type { Action, ApiMap, ApiResponse } from '../../shared/api.ts';
import { SEED_STATUSES } from '../../shared/statuses.ts';
import type { Member } from '../../shared/types.ts';

export interface FakePlatform extends Platform {
  cacheData: Map<string, string>;
  propsData: Map<string, string>;
  fetchCalls: { url: string; body?: string }[];
  fetchImpl: (url: string) => { status: number; body: string };
  clock: Date;
  logs: string[];
}

export function fakePlatform(): FakePlatform {
  const cacheData = new Map<string, string>();
  const propsData = new Map<string, string>();
  const p: FakePlatform = {
    cacheData,
    propsData,
    fetchCalls: [],
    fetchImpl: () => ({ status: 200, body: '{"items":[]}' }),
    clock: new Date('2026-11-11T08:00:00Z'),
    logs: [],
    now: () => new Date(p.clock),
    uuid: () => randomUUID(),
    sha256Hex: (t) => createHash('sha256').update(t).digest('hex'),
    withLock: (fn) => fn(),
    cache: {
      get: (k) => cacheData.get(k) ?? null,
      put: (k, v) => void cacheData.set(k, v),
      remove: (k) => void cacheData.delete(k),
    },
    props: { get: (k) => propsData.get(k) ?? null, set: (k, v) => void propsData.set(k, v) },
    fetch: (url, init) => {
      p.fetchCalls.push({ url, body: init?.body });
      return p.fetchImpl(url);
    },
    sleep: () => {},
    log: (m) => void p.logs.push(m),
  };
  return p;
}

export const ADMIN: Member = { id: 'm-admin', name: 'Admin', phone: '0500000001', type: 'regular', isAdmin: true, active: true, order: 1 };
export const ALICE: Member = { id: 'm-alice', name: 'Alice', phone: '0500000002', type: 'regular', isAdmin: false, active: true, order: 2 };
export const BOB: Member = { id: 'm-bob', name: 'Bob', phone: '0500000003', type: 'student', isAdmin: false, active: true, order: 3 };
export const GONE: Member = { id: 'm-gone', name: 'Gone', phone: '0500000004', type: 'regular', isAdmin: false, active: false, order: 4 };

export interface World {
  ctx: Ctx;
  p: FakePlatform;
  tables: Record<string, MemoryTable>;
  call<A extends Action>(action: A, req: ApiMap[A]['req'] & { token?: string }): ApiResponse<A>;
  ok<A extends Action>(action: A, req: ApiMap[A]['req'] & { token?: string }): ApiMap[A]['res'];
  loginAs(member: Member): string;
}

/** A backend over in-memory tables seeded with fake members and the default statuses. */
export function world(members: Member[] = [ADMIN, ALICE, BOB, GONE]): World {
  const tables = Object.fromEntries(TABLE_NAMES.map((n) => [n, new MemoryTable()])) as Record<string, MemoryTable>;
  tables.members!.append(members.map(fromMember));
  tables.statuses!.append(SEED_STATUSES.map(fromStatus));
  const p = fakePlatform();
  const ctx = makeCtx(new Repo(tables as unknown as Tables), p);
  const call = <A extends Action>(action: A, req: object) => handle(ctx, JSON.stringify({ action, ...req })) as ApiResponse<A>;
  const ok = <A extends Action>(action: A, req: object) => {
    const res = call<A>(action, req);
    if (!res.ok) throw new Error(`${action} failed: ${res.error.code} ${res.error.message}`);
    return res.data;
  };
  const loginAs = (m: Member) => ok('login', { phone: m.phone! }).token;
  return { ctx, p, tables, call, ok, loginAs };
}

/** Expects a failed response with the given error code. */
export function errorCode(res: ApiResponse): string {
  if (res.ok) throw new Error('Expected an error response');
  return res.error.code;
}
