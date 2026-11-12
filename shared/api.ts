import type { DayInput, Entry, Holiday, Member, Status } from './types.ts';

/** Request payload of actions that take no parameters. */
export type NoParams = Record<never, never>;

/** Max span of one getRange call (covers a year of range fill). */
export const MAX_RANGE_DAYS = 400;

export interface Bootstrap {
  me: Member;
  /** Phones are stripped unless the caller is an admin. */
  members: Member[];
  /** Including retired statuses, so old days still render. */
  statuses: Status[];
  vapidPublicKey: string;
  pushTestEnabled: boolean;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushSub {
  memberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushCoverage {
  memberId: string;
  devices: number;
  lastResult: string;
  lastResultAt: string;
}

export interface PushResult {
  endpoint: string;
  /** HTTP status from the push service, 0 for a network error. */
  status: number;
}

export interface MemberInput {
  id?: string;
  name: string;
  phone: string;
  type: Member['type'];
  isAdmin: boolean;
  active: boolean;
  order?: number;
}

export type StatusInput = Omit<Status, 'id' | 'order'> & { id?: string; order?: number };

export interface ServiceConfig {
  serviceToken?: string;
  vapidPublicKey?: string;
  githubRepo?: string;
  githubDispatchToken?: string;
}

/** Every API action: request payload and response data. Requests also carry a session or service token. */
export interface ApiMap {
  health: { req: NoParams; res: { name: string; version: string; time: string } };
  login: { req: { phone: string }; res: { token: string; me: Member } };
  logout: { req: NoParams; res: { ok: true } };
  bootstrap: { req: NoParams; res: Bootstrap };
  getRange: { req: { from: string; to: string }; res: { entries: Entry[]; holidays: Holiday[] } };
  setDays: { req: { memberId: string; days: DayInput[] }; res: { entries: Entry[] } };

  adminMembers: { req: NoParams; res: { members: Member[] } };
  saveMember: { req: { member: MemberInput }; res: { member: Member } };
  saveStatus: { req: { status: StatusInput }; res: { status: Status } };
  revokeSessions: { req: { memberId: string }; res: { revoked: number } };
  reorder: { req: { kind: 'members' | 'statuses'; ids: string[] }; res: { ok: true } };

  pushSubscribe: { req: { subscription: PushSubscriptionInput }; res: { ok: true } };
  pushUnsubscribe: { req: { endpoint: string }; res: { ok: true } };
  pushTest: { req: NoParams; res: { ok: true } };
  pushCoverage: { req: NoParams; res: { coverage: PushCoverage[] } };

  svcConfigure: { req: { config: ServiceConfig }; res: { configured: string[] } };
  svcImportMembers: { req: { members: MemberInput[] }; res: { created: number; updated: number } };
  svcPushList: { req: { memberId?: string }; res: { subscriptions: PushSub[] } };
  svcPushReport: { req: { results: PushResult[] }; res: { removed: number } };
  svcReminderClaim: { req: { week: string; release?: boolean }; res: { claimed: boolean } };
}

export type Action = keyof ApiMap;

export type ApiRequest<A extends Action = Action> = { action: A; token?: string } & ApiMap[A]['req'];

export type ApiResponse<A extends Action = Action> =
  | { ok: true; data: ApiMap[A]['res'] }
  | { ok: false; error: { code: string; message: string } };
