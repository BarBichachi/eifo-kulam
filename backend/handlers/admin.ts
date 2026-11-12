import type { ApiMap, MemberInput, StatusInput } from '../../shared/api.ts';
import { AppError, ERR } from '../../shared/errors.ts';
import { normalizePhone } from '../../shared/phone.ts';
import { CATEGORIES, PALETTE } from '../../shared/statuses.ts';
import type { Member, Status } from '../../shared/types.ts';
import { newId, type Ctx } from '../context.ts';
import { fromMember, fromStatus, toMember, toStatus } from '../repo/repo.ts';

const bad = (message: string): never => {
  throw new AppError(ERR.BAD_REQUEST, message);
};

const cleanText = (v: unknown, max: number, field: string): string => {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!s) bad(`חסר ${field}`);
  if (s.length > max) bad(`${field} ארוך מדי (עד ${max} תווים)`);
  return s;
};

/** Validates a member form; phone must be a unique Israeli mobile number. */
function validateMember(input: MemberInput, others: Member[]): Omit<Member, 'id' | 'order'> {
  const name = cleanText(input?.name, 40, 'שם');
  const phone = normalizePhone(input?.phone) ?? bad('מספר טלפון לא תקין');
  if (others.some((m) => m.phone === phone)) bad(`המספר ${phone} כבר שייך ל${others.find((m) => m.phone === phone)?.name}`);
  if (input.type !== 'regular' && input.type !== 'student') bad('סוג עובד לא תקין');
  return { name, phone, type: input.type, isAdmin: input.isAdmin === true, active: input.active !== false };
}

/** Upserts one member by id inside the caller's lock. */
function upsertMember(ctx: Ctx, input: MemberInput): Member {
  const table = ctx.repo.t.members;
  const all = table.rows().map(toMember);
  const index = input.id ? all.findIndex((m) => m.id === input.id) : -1;
  if (input.id && index < 0) throw new AppError(ERR.NOT_FOUND, 'חבר הצוות לא נמצא');
  const fields = validateMember(input, all.filter((_, i) => i !== index));
  const order = typeof input.order === 'number' ? input.order : (all[index]?.order ?? Math.max(0, ...all.map((m) => m.order)) + 1);
  const member: Member = { id: all[index]?.id ?? newId(ctx, 'm'), order, ...fields };

  const after = all.map((m, i) => (i === index ? member : m));
  if (index < 0) after.push(member);
  // Only blocks removing the last admin; a fresh roster may be imported before any admin exists
  const hadAdmin = all.some((m) => m.isAdmin && m.active);
  if (hadAdmin && !after.some((m) => m.isAdmin && m.active)) bad('חייב להישאר לפחות מנהל/ת פעיל/ה אחד/ת');

  if (index < 0) table.append([fromMember(member)]);
  else table.update(index, fromMember(member));
  return member;
}

export function adminMembers(ctx: Ctx): ApiMap['adminMembers']['res'] {
  return { members: ctx.repo.members() };
}

export function saveMember(ctx: Ctx, req: ApiMap['saveMember']['req']): ApiMap['saveMember']['res'] {
  return ctx.locked(() => ({ member: upsertMember(ctx, req.member) }));
}

/** Bulk roster import from the local script: matches existing members by phone. */
export function importMembers(ctx: Ctx, req: ApiMap['svcImportMembers']['req']): ApiMap['svcImportMembers']['res'] {
  if (!Array.isArray(req.members) || req.members.length === 0) bad('No members to import');
  return ctx.locked(() => {
    let created = 0;
    let updated = 0;
    for (const input of req.members) {
      const phone = normalizePhone(input.phone);
      const existing = ctx.repo.t.members.rows().map(toMember).find((m) => m.phone === phone);
      upsertMember(ctx, { ...input, id: existing?.id, order: input.order ?? existing?.order });
      if (existing) updated++;
      else created++;
    }
    return { created, updated };
  });
}

/** Validates a status form: label, emoji, palette color, category. */
function validateStatus(input: StatusInput, others: Status[]): Omit<Status, 'id' | 'order'> {
  const label = cleanText(input?.label, 30, 'שם סטטוס');
  if (others.some((s) => s.label === label)) bad(`כבר קיים סטטוס בשם "${label}"`);
  const emoji = typeof input.emoji === 'string' ? input.emoji.trim() : '';
  if (!emoji || [...emoji].length > 4) bad('צריך אימוג׳י אחד');
  if (!(PALETTE as readonly string[]).includes(input.color)) bad('צבע לא תקין');
  if (!CATEGORIES.includes(input.category)) bad('קטגוריה לא תקינה');
  return { label, emoji, color: input.color, category: input.category, requiresNote: input.requiresNote === true, active: input.active !== false };
}

export function saveStatus(ctx: Ctx, req: ApiMap['saveStatus']['req']): ApiMap['saveStatus']['res'] {
  return ctx.locked(() => {
    const table = ctx.repo.t.statuses;
    const all = table.rows().map(toStatus);
    const input = req.status;
    const index = input?.id ? all.findIndex((s) => s.id === input.id) : -1;
    if (input?.id && index < 0) throw new AppError(ERR.NOT_FOUND, 'הסטטוס לא נמצא');
    const fields = validateStatus(input, all.filter((_, i) => i !== index));
    const order = typeof input.order === 'number' ? input.order : (all[index]?.order ?? Math.max(0, ...all.map((s) => s.order)) + 1);
    const status: Status = { id: all[index]?.id ?? newId(ctx, 's'), order, ...fields };
    if (index < 0) table.append([fromStatus(status)]);
    else table.update(index, fromStatus(status));
    return { status };
  });
}

/** Sets order = position for the given ids (members or statuses); ids not listed keep their order. */
export function reorder(ctx: Ctx, kind: 'members' | 'statuses', ids: unknown): { ok: true } {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) bad('ids must be a list');
  const position = new Map((ids as string[]).map((id, i) => [id, i + 1]));
  ctx.locked(() => {
    const table = ctx.repo.t[kind];
    table.rows().forEach((row, i) => {
      const order = position.get(row.id ?? '');
      if (order !== undefined && row.order !== String(order)) table.update(i, { ...row, order: String(order) });
    });
  });
  return { ok: true };
}
