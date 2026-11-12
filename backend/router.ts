import type { Action, ApiResponse } from '../shared/api.ts';
import { AppError, ERR } from '../shared/errors.ts';
import type { Member } from '../shared/types.ts';
import type { Ctx } from './context.ts';
import { adminMembers, importMembers, reorder, saveMember, saveStatus } from './handlers/admin.ts';
import { pushCoverage, pushSubscribe, pushTest, pushUnsubscribe, svcPushList, svcPushReport, svcReminderClaim } from './handlers/push.ts';
import { svcConfigure } from './handlers/service.ts';
import { bootstrap, getRange, setDays } from './handlers/user.ts';
import { authenticate, login, logout, requireService, revokeMemberSessions } from './services/auth.ts';

export const APP_VERSION = '1.0.0';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Req = any;
type Route =
  | { auth: 'none'; run: (ctx: Ctx, req: Req) => unknown }
  | { auth: 'user' | 'admin'; run: (ctx: Ctx, req: Req, me: Member) => unknown }
  | { auth: 'service'; run: (ctx: Ctx, req: Req) => unknown };

/** Every action, its access level and handler. */
const ROUTES: Record<Action, Route> = {
  health: { auth: 'none', run: (ctx) => ({ name: 'eifo-kulam', version: APP_VERSION, time: ctx.p.now().toISOString() }) },
  login: { auth: 'none', run: (ctx, req) => login(ctx, req.phone) },
  logout: { auth: 'none', run: (ctx, req) => (logout(ctx, req.token), { ok: true }) },
  bootstrap: { auth: 'user', run: (ctx, _req, me) => bootstrap(ctx, me) },
  getRange: { auth: 'user', run: (ctx, req) => getRange(ctx, req) },
  setDays: { auth: 'user', run: (ctx, req, me) => setDays(ctx, me, req) },

  adminMembers: { auth: 'admin', run: (ctx) => adminMembers(ctx) },
  saveMember: { auth: 'admin', run: (ctx, req) => saveMember(ctx, req) },
  saveStatus: { auth: 'admin', run: (ctx, req) => saveStatus(ctx, req) },
  revokeSessions: { auth: 'admin', run: (ctx, req) => ({ revoked: revokeMemberSessions(ctx, String(req.memberId ?? '')) }) },
  reorder: {
    auth: 'admin',
    run: (ctx, req) => {
      if (req.kind !== 'members' && req.kind !== 'statuses') throw new AppError(ERR.BAD_REQUEST, 'Unknown reorder kind');
      return reorder(ctx, req.kind, req.ids);
    },
  },

  pushSubscribe: { auth: 'user', run: (ctx, req, me) => pushSubscribe(ctx, me, req) },
  pushUnsubscribe: { auth: 'user', run: (ctx, req, me) => pushUnsubscribe(ctx, me, req) },
  pushTest: { auth: 'user', run: (ctx, _req, me) => pushTest(ctx, me) },
  pushCoverage: { auth: 'admin', run: (ctx) => pushCoverage(ctx) },

  // svcConfigure checks its own token (the first call bootstraps it)
  svcConfigure: { auth: 'none', run: (ctx, req) => svcConfigure(ctx, req.token, req) },
  svcImportMembers: { auth: 'service', run: (ctx, req) => importMembers(ctx, req) },
  svcPushList: { auth: 'service', run: (ctx, req) => svcPushList(ctx, req) },
  svcPushReport: { auth: 'service', run: (ctx, req) => svcPushReport(ctx, req) },
  svcReminderClaim: { auth: 'service', run: (ctx, req) => svcReminderClaim(ctx, req) },
};

/** Parses, authorizes and runs one API request. Never throws: errors become { ok: false }. */
export function handle(ctx: Ctx, body: string): ApiResponse {
  let action = '';
  try {
    let req: Req;
    try {
      req = JSON.parse(body);
    } catch {
      throw new AppError(ERR.BAD_REQUEST, 'Invalid JSON body');
    }
    action = typeof req?.action === 'string' ? req.action : '';
    const route = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action as Action] : undefined;
    if (!route) throw new AppError(ERR.BAD_REQUEST, `Unknown action: ${action}`);

    if (route.auth === 'none') return { ok: true, data: route.run(ctx, req) as never };
    if (route.auth === 'service') {
      requireService(ctx, req.token);
      return { ok: true, data: route.run(ctx, req) as never };
    }
    const me = authenticate(ctx, req.token);
    if (route.auth === 'admin' && !me.isAdmin) throw new AppError(ERR.FORBIDDEN, 'הפעולה זמינה למנהלים בלבד');
    return { ok: true, data: route.run(ctx, req, me) as never };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message } };
    ctx.p.log(`Unhandled error in ${action || 'request'}`, err instanceof Error ? err.stack : err);
    return { ok: false, error: { code: ERR.INTERNAL, message: 'אירעה שגיאה בשרת. נסו שוב בעוד רגע.' } };
  }
}
