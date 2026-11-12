import type { ApiMap, PushCoverage, PushSubscriptionInput } from '../../shared/api.ts';
import { AppError, ERR } from '../../shared/errors.ts';
import { isIsoDate } from '../../shared/dates.ts';
import type { Member } from '../../shared/types.ts';
import type { Ctx } from '../context.ts';
import { PROP } from '../platform.ts';
import { toPush } from '../repo/repo.ts';

const MAX_DEVICES_PER_MEMBER = 10;
const TEST_COOLDOWN_SECONDS = 60;
const CLAIM_KEY = 'reminderSentWeek';

const bad = (message: string): never => {
  throw new AppError(ERR.BAD_REQUEST, message);
};

function validSubscription(sub: PushSubscriptionInput | undefined): PushSubscriptionInput {
  const endpoint = sub?.endpoint;
  if (typeof endpoint !== 'string' || !/^https:\/\/\S+$/.test(endpoint) || endpoint.length > 1000) bad('מנוי התראות לא תקין');
  const { p256dh, auth } = sub?.keys ?? {};
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) bad('מנוי התראות לא תקין');
  return sub as PushSubscriptionInput;
}

/** Stores (or re-assigns) this device's push subscription; keeps the newest N per member. */
export function pushSubscribe(ctx: Ctx, me: Member, req: ApiMap['pushSubscribe']['req']): ApiMap['pushSubscribe']['res'] {
  const sub = validSubscription(req.subscription);
  ctx.locked(() => {
    const table = ctx.repo.t.push;
    const now = ctx.p.now().toISOString();
    const row = { memberId: me.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, createdAt: now, lastResult: '', lastResultAt: '' };
    const index = table.rows().findIndex((r) => r.endpoint === sub.endpoint);
    if (index >= 0) table.update(index, row);
    else table.append([row]);
    const mine = table.rows().flatMap((r, i) => (r.memberId === me.id ? [{ i, createdAt: r.createdAt ?? '' }] : []));
    const excess = mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, Math.max(0, mine.length - MAX_DEVICES_PER_MEMBER));
    if (excess.length) table.remove(excess.map((x) => x.i));
  });
  return { ok: true };
}

export function pushUnsubscribe(ctx: Ctx, me: Member, req: ApiMap['pushUnsubscribe']['req']): ApiMap['pushUnsubscribe']['res'] {
  ctx.locked(() => {
    const table = ctx.repo.t.push;
    const indexes = table.rows().flatMap((r, i) => (r.endpoint === req.endpoint && r.memberId === me.id ? [i] : []));
    table.remove(indexes);
  });
  return { ok: true };
}

/** Asks GitHub Actions to send a real push to this member's devices (same path as the weekly reminder). */
export function pushTest(ctx: Ctx, me: Member): ApiMap['pushTest']['res'] {
  const repo = ctx.p.props.get(PROP.GITHUB_REPO);
  const token = ctx.p.props.get(PROP.GITHUB_DISPATCH_TOKEN);
  if (!repo || !token) throw new AppError(ERR.NOT_CONFIGURED, 'שליחת בדיקה מהאפליקציה עוד לא הוגדרה. פנו למנהל/ת.');
  if (!ctx.repo.t.push.rows().some((r) => r.memberId === me.id)) bad('ההתראות לא מופעלות במכשיר הזה. הפעילו אותן קודם.');
  const cooldownKey = `push-test:${me.id}`;
  if (ctx.p.cache.get(cooldownKey)) throw new AppError(ERR.RATE_LIMITED, 'בדיקה כבר נשלחה. חכו דקה ונסו שוב.');

  const res = ctx.p.fetch(`https://api.github.com/repos/${repo}/actions/workflows/reminder.yml/dispatches`, {
    method: 'post',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs: { memberId: me.id } }),
  });
  if (res.status !== 204) {
    ctx.p.log('GitHub dispatch failed', { status: res.status, body: res.body.slice(0, 500) });
    throw new AppError(ERR.INTERNAL, 'שליחת הבדיקה נכשלה. נסו שוב מאוחר יותר.');
  }
  ctx.p.cache.put(cooldownKey, '1', TEST_COOLDOWN_SECONDS);
  return { ok: true };
}

export function pushCoverage(ctx: Ctx): ApiMap['pushCoverage']['res'] {
  const byMember = new Map<string, PushCoverage>();
  for (const sub of ctx.repo.t.push.rows().map(toPush)) {
    const c = byMember.get(sub.memberId) ?? { memberId: sub.memberId, devices: 0, lastResult: '', lastResultAt: '' };
    c.devices++;
    if (sub.lastResultAt > c.lastResultAt) {
      c.lastResult = sub.lastResult;
      c.lastResultAt = sub.lastResultAt;
    }
    byMember.set(sub.memberId, c);
  }
  return { coverage: [...byMember.values()] };
}

export function svcPushList(ctx: Ctx, req: ApiMap['svcPushList']['req']): ApiMap['svcPushList']['res'] {
  const active = new Set(ctx.repo.members().filter((m) => m.active).map((m) => m.id));
  const subscriptions = ctx.repo.t.push.rows().map(toPush)
    .filter((s) => active.has(s.memberId) && (!req.memberId || s.memberId === req.memberId))
    .map(({ memberId, endpoint, p256dh, auth }) => ({ memberId, endpoint, p256dh, auth }));
  return { subscriptions };
}

/** Records send results; 404/410 mean the browser dropped the subscription, so it is deleted. */
export function svcPushReport(ctx: Ctx, req: ApiMap['svcPushReport']['req']): ApiMap['svcPushReport']['res'] {
  if (!Array.isArray(req.results)) bad('results must be an array');
  const byEndpoint = new Map(req.results.map((r) => [r.endpoint, r.status]));
  return ctx.locked(() => {
    const table = ctx.repo.t.push;
    const now = ctx.p.now().toISOString();
    const gone: number[] = [];
    table.rows().forEach((r, i) => {
      const status = byEndpoint.get(r.endpoint ?? '');
      if (status === undefined) return;
      if (status === 404 || status === 410) gone.push(i);
      else table.update(i, { ...r, lastResult: String(status), lastResultAt: now });
    });
    table.remove(gone);
    return { removed: gone.length };
  });
}

/** Exactly-once guard for the weekly reminder across the two cron runs. release=true undoes a failed send. */
export function svcReminderClaim(ctx: Ctx, req: ApiMap['svcReminderClaim']['req']): ApiMap['svcReminderClaim']['res'] {
  if (!isIsoDate(req.week)) bad('week must be an ISO date');
  return ctx.locked(() => {
    const current = ctx.repo.setting(CLAIM_KEY);
    if (req.release) {
      if (current === req.week) ctx.repo.setSetting(CLAIM_KEY, '');
      return { claimed: false };
    }
    if (current === req.week) return { claimed: false };
    ctx.repo.setSetting(CLAIM_KEY, req.week);
    return { claimed: true };
  });
}
