import { AppError, ERR } from '../../shared/errors.ts';
import { normalizePhone } from '../../shared/phone.ts';
import type { Member } from '../../shared/types.ts';
import type { Ctx } from '../context.ts';
import { PROP } from '../platform.ts';

const SESSION_CACHE_SECONDS = 6 * 60 * 60;
const LOGIN_FAIL_KEY = 'login-fail';
const LOGIN_FAIL_LIMIT = 60;
const LOGIN_FAIL_WINDOW_SECONDS = 60 * 60;
/** lastSeenAt is refreshed at most this often (it costs a sheet write). */
const LAST_SEEN_REFRESH_MS = 24 * 60 * 60 * 1000;

const cacheKey = (hash: string) => `s:${hash}`;

const unauthorized = () => new AppError(ERR.UNAUTHORIZED, 'החיבור פג. יש להתחבר מחדש עם מספר הטלפון.');

// Phone-only login: the number must belong to an active member. Failures are throttled globally.
export function login(ctx: Ctx, rawPhone: unknown): { token: string; me: Member } {
  const fails = Number(ctx.p.cache.get(LOGIN_FAIL_KEY) ?? '0');
  if (fails >= LOGIN_FAIL_LIMIT) throw new AppError(ERR.RATE_LIMITED, 'יותר מדי ניסיונות כניסה. נסו שוב בעוד שעה.');

  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError(ERR.BAD_REQUEST, 'מספר הטלפון לא תקין. דוגמה: 0501234567');

  const me = ctx.repo.members().find((m) => m.active && m.phone === phone);
  if (!me) {
    ctx.p.cache.put(LOGIN_FAIL_KEY, String(fails + 1), LOGIN_FAIL_WINDOW_SECONDS);
    ctx.p.sleep(500);
    throw new AppError(ERR.UNKNOWN_PHONE, 'המספר לא נמצא ברשימת הצוות. פנו למנהל/ת כדי להוסיף אתכם.');
  }

  const token = `${ctx.p.uuid()}${ctx.p.uuid()}`.replace(/-/g, '');
  const hash = ctx.p.sha256Hex(token);
  const now = ctx.p.now().toISOString();
  ctx.locked(() => ctx.repo.t.sessions.append([{ tokenHash: hash, memberId: me.id, createdAt: now, lastSeenAt: now }]));
  ctx.p.cache.put(cacheKey(hash), me.id, SESSION_CACHE_SECONDS);
  return { token, me };
}

// Resolves a session token to an active member (cache first, then the sessions tab)
export function authenticate(ctx: Ctx, token: unknown): Member {
  if (typeof token !== 'string' || token.length < 32) throw unauthorized();
  const hash = ctx.p.sha256Hex(token);
  let memberId = ctx.p.cache.get(cacheKey(hash));
  if (!memberId) {
    const index = ctx.repo.t.sessions.rows().findIndex((r) => r.tokenHash === hash);
    const row = ctx.repo.t.sessions.rows()[index];
    if (!row?.memberId) throw unauthorized();
    memberId = row.memberId;
    refreshLastSeen(ctx, hash);
    ctx.p.cache.put(cacheKey(hash), memberId, SESSION_CACHE_SECONDS);
  }
  const me = ctx.repo.members().find((m) => m.id === memberId && m.active);
  if (!me) throw unauthorized();
  return me;
}

function refreshLastSeen(ctx: Ctx, hash: string): void {
  const now = ctx.p.now();
  const row = ctx.repo.t.sessions.rows().find((r) => r.tokenHash === hash);
  if (row && now.getTime() - Date.parse(row.lastSeenAt ?? '') < LAST_SEEN_REFRESH_MS) return;
  ctx.locked(() => {
    const i = ctx.repo.t.sessions.rows().findIndex((r) => r.tokenHash === hash);
    const current = ctx.repo.t.sessions.rows()[i];
    if (current) ctx.repo.t.sessions.update(i, { ...current, lastSeenAt: now.toISOString() });
  });
}

/** Deletes sessions matching the predicate and evicts them from the cache. */
function removeSessions(ctx: Ctx, match: (tokenHash: string, memberId: string) => boolean): number {
  return ctx.locked(() => {
    const rows = ctx.repo.t.sessions.rows();
    const indexes = rows.flatMap((r, i) => (match(r.tokenHash ?? '', r.memberId ?? '') ? [i] : []));
    for (const i of indexes) ctx.p.cache.remove(cacheKey(rows[i]?.tokenHash ?? ''));
    ctx.repo.t.sessions.remove(indexes);
    return indexes.length;
  });
}

export function logout(ctx: Ctx, token: unknown): void {
  if (typeof token !== 'string') return;
  const hash = ctx.p.sha256Hex(token);
  removeSessions(ctx, (h) => h === hash);
}

export function revokeMemberSessions(ctx: Ctx, memberId: string): number {
  return removeSessions(ctx, (_h, m) => m === memberId);
}

// Service calls (GitHub Actions, local scripts) use a shared secret stored in Script Properties
export function requireService(ctx: Ctx, token: unknown): void {
  const expected = ctx.p.props.get(PROP.SERVICE_TOKEN);
  if (!expected || typeof token !== 'string' || token !== expected) {
    throw new AppError(ERR.UNAUTHORIZED, 'Invalid service token');
  }
}
