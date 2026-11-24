import type { ApiMap } from '../../shared/api.ts';
import { AppError, ERR } from '../../shared/errors.ts';
import { normalizePhone } from '../../shared/phone.ts';
import type { Viewer } from '../../shared/types.ts';
import { newId, type Ctx } from '../context.ts';
import { fromViewer, toViewer } from '../repo/repo.ts';
import { revokeMemberSessions } from '../services/auth.ts';
import { assertPhoneFree, bad, cleanText } from './admin.ts';

const notFound = () => new AppError(ERR.NOT_FOUND, 'הצופה לא נמצא/ה');

export function adminViewers(ctx: Ctx): ApiMap['adminViewers']['res'] {
  return { viewers: ctx.repo.viewers() };
}

/** Adds or edits a read-only viewer. The phone is their login and must not belong to anyone else. */
export function saveViewer(ctx: Ctx, req: ApiMap['saveViewer']['req']): ApiMap['saveViewer']['res'] {
  const input = req?.viewer;
  return ctx.locked(() => {
    const table = ctx.repo.t.viewers;
    const all = table.rows().map(toViewer);
    const index = input?.id ? all.findIndex((v) => v.id === input.id) : -1;
    if (input?.id && index < 0) throw notFound();
    const name = cleanText(input?.name, 40, 'שם');
    const phone = normalizePhone(input?.phone) ?? bad('מספר טלפון לא תקין');
    assertPhoneFree(ctx, phone, all[index]?.id);

    const existing = all[index];
    const viewer: Viewer = { id: existing?.id ?? newId(ctx, 'v'), name, phone, createdAt: existing?.createdAt || ctx.p.now().toISOString() };
    if (existing) table.update(index, fromViewer(viewer));
    else table.append([fromViewer(viewer)]);
    return { viewer };
  });
}

/** Deletes a viewer and signs them out of every device (viewers have no history worth keeping). */
export function deleteViewer(ctx: Ctx, req: ApiMap['deleteViewer']['req']): ApiMap['deleteViewer']['res'] {
  const viewerId = typeof req?.viewerId === 'string' ? req.viewerId : '';
  ctx.locked(() => {
    const table = ctx.repo.t.viewers;
    const index = table.rows().findIndex((r) => r.id === viewerId);
    if (!viewerId || index < 0) throw notFound();
    table.remove([index]);
  });
  // Separate lock: the script lock is not re-entrant
  return { revoked: revokeMemberSessions(ctx, viewerId) };
}
