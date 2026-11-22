import type { Bootstrap, RangeData } from '../../../shared/api.ts';
import { addDays, israelToday, nextWeekStart, weekStart } from '../../../shared/dates.ts';
import type { DayInput, Entry, Holiday, Member } from '../../../shared/types.ts';
import { api, ApiError } from './api.ts';
import { readJson, removeKey, writeJson } from './storage.ts';

export interface Session {
  token: string;
  me: Member;
}

export interface WeekData {
  entries: Entry[];
  holidays: Holiday[];
  fetchedAt: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface State {
  session: Session | null;
  boot: Bootstrap | null;
  bootError: string | null;
  weeks: Record<string, WeekData>;
  weekErrors: Record<string, string>;
  saveState: SaveState;
  toast: Toast | null;
  /** Bumped when the app returns to the foreground so date-based screens re-render. */
  resumeTick: number;
  /** A data request is in flight (shown as a small spinner). */
  refreshing: boolean;
  /** The last background refresh failed while older data stays on screen. */
  staleError: string | null;
}

const SESSION_KEY = 'session';
const CACHE_KEY = 'cache';
/** A cached week younger than this is not re-fetched on navigation. */
const FRESH_MS = 60_000;
/** Visible weeks are re-fetched this often while the app is on screen, so other people's changes show up. */
export const POLL_MS = 60_000;
const SAVE_DEBOUNCE_MS = 700;
const MAX_CACHED_WEEKS = 16;
/** Visible weeks further apart than this are fetched separately instead of as one span. */
const MAX_SPAN_WEEKS = 6;

interface PersistedCache {
  memberId: string;
  boot: Bootstrap | null;
  weeks: Record<string, WeekData>;
}

type Change = Pick<Entry, 'date' | 'statusId' | 'note'>;

/** Sunday of every week from fromWs to toWs inclusive. */
export function weekList(fromWs: string, toWs: string): string[] {
  const out: string[] = [];
  for (let ws = fromWs; ws <= toWs; ws = addDays(ws, 7)) out.push(ws);
  return out;
}

/** Replaces the member's row for each day inside the cached weeks (empty statusId removes it). */
function applyToWeeks(weeks: Record<string, WeekData>, memberId: string, changes: Change[], actorId: string) {
  const next = { ...weeks };
  for (const c of changes) {
    const ws = weekStart(c.date);
    const week = next[ws];
    if (!week) continue;
    const entries = week.entries.filter((e) => !(e.date === c.date && e.memberId === memberId));
    if (c.statusId) entries.push({ date: c.date, memberId, statusId: c.statusId, note: c.note, updatedAt: new Date().toISOString(), updatedBy: actorId });
    next[ws] = { ...week, entries };
  }
  return next;
}

const asChanges = (days: Iterable<DayInput>): Change[] => [...days].map((d) => ({ ...d, statusId: d.statusId ?? '' }));
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** App state container: session, cached data, optimistic saves, background refresh. UI subscribes via useStore. */
export class Store {
  state: State;
  private listeners = new Set<() => void>();
  /** Edits waiting for the debounce. */
  private pending = new Map<string, Map<string, DayInput>>();
  /** Edits sent to the server and not yet confirmed. */
  private sending = new Map<string, Map<string, DayInput>>();
  /** Bumped per week on every local edit; a read that started before an edit must not overwrite it. */
  private editEpoch = new Map<string, number>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight = new Map<string, Promise<void>>();
  private reads = 0;
  /** Weeks currently on screen (ref-counted by useWeek). */
  private watched = new Map<string, number>();
  private toastSeq = 0;

  constructor() {
    const session = readJson<Session>(SESSION_KEY);
    const cache = session ? readJson<PersistedCache>(CACHE_KEY) : null;
    const own = cache && cache.memberId === session?.me.id ? cache : null;
    this.state = {
      session,
      boot: own?.boot ?? null,
      bootError: null,
      weeks: own?.weeks ?? {},
      weekErrors: {},
      saveState: 'idle',
      toast: null,
      resumeTick: 0,
      refreshing: false,
      staleError: null,
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
    if ('boot' in patch || 'weeks' in patch) this.persist();
  }

  private persist(): void {
    const { session, boot, weeks } = this.state;
    if (!session) return;
    const recent = Object.keys(weeks).sort().slice(-MAX_CACHED_WEEKS);
    writeJson(CACHE_KEY, { memberId: session.me.id, boot, weeks: Object.fromEntries(recent.map((k) => [k, weeks[k]])) });
  }

  toast(text: string, kind: Toast['kind'] = 'info'): void {
    const id = ++this.toastSeq;
    this.set({ toast: { id, text, kind } });
    setTimeout(() => {
      if (this.state.toast?.id === id) this.set({ toast: null });
    }, kind === 'error' ? 6000 : 3000);
  }

  private get token(): string | undefined {
    return this.state.session?.token;
  }

  /** Any expired-session error logs the user out instead of leaving a broken screen. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
        this.clearLocal();
        this.toast(err.message, 'error');
      }
      throw err;
    }
  }

  /** Last week, this week and next week: what the first screens show. */
  private homeWindow(): [string, string] {
    const today = israelToday();
    return [addDays(weekStart(today), -7), nextWeekStart(today)];
  }

  private epoch(ws: string): number {
    return this.editEpoch.get(ws) ?? 0;
  }

  /** Stores server data per week, skipping weeks edited locally after the read started. */
  private applyRange(list: string[], data: RangeData, startEpochs: Map<string, number>): void {
    let weeks = { ...this.state.weeks };
    const weekErrors = { ...this.state.weekErrors };
    const now = Date.now();
    for (const ws of list) {
      const end = addDays(ws, 6);
      if (startEpochs.get(ws) !== this.epoch(ws)) {
        // Older than a local edit: keep what is shown and let the next refresh bring the rest
        if (weeks[ws]) weeks[ws] = { ...weeks[ws]!, fetchedAt: 0 };
        continue;
      }
      weeks[ws] = {
        entries: data.entries.filter((e) => e.date >= ws && e.date <= end),
        holidays: data.holidays.filter((h) => h.date >= ws && h.date <= end),
        fetchedAt: now,
      };
      delete weekErrors[ws];
    }
    // Edits not yet confirmed by the server stay visible on top of the fresh data
    const actor = this.state.session?.me.id ?? '';
    for (const queue of [this.sending, this.pending]) {
      for (const [memberId, days] of queue) weeks = applyToWeeks(weeks, memberId, asChanges(days.values()), actor);
    }
    this.set({ weeks, weekErrors, staleError: null });
  }

  /**
   * Runs one request that returns a span of weeks. Concurrent loads of the same weeks share it.
   * The returned promise rejects on failure; the cached data stays and the error is recorded.
   */
  private fetchWeeks(fromWs: string, toWs: string, request: () => Promise<RangeData | undefined>): Promise<void> {
    const list = weekList(fromWs, toWs);
    const startEpochs = new Map(list.map((ws) => [ws, this.epoch(ws)]));
    this.reads++;
    this.set({ refreshing: true });
    const run = (async () => {
      try {
        const data = await request();
        if (data && this.state.session) this.applyRange(list, data, startEpochs);
      } catch (err) {
        if (this.state.session) {
          const weekErrors = { ...this.state.weekErrors };
          for (const ws of list) weekErrors[ws] = errorText(err);
          this.set({ weekErrors, staleError: errorText(err) });
        }
        throw err;
      } finally {
        this.reads--;
        this.set({ refreshing: this.reads > 0 });
      }
    })();
    const settled = run.catch(() => {});
    for (const ws of list) this.inflight.set(ws, settled);
    void settled.then(() => {
      for (const ws of list) if (this.inflight.get(ws) === settled) this.inflight.delete(ws);
    });
    return run;
  }

  private applyBoot(boot: Bootstrap): void {
    const session = { token: this.token!, me: boot.me };
    writeJson(SESSION_KEY, session);
    this.set({ boot, session, bootError: null });
  }

  async login(phone: string): Promise<void> {
    const [from, to] = this.homeWindow();
    const startEpochs = new Map(weekList(from, to).map((ws) => [ws, this.epoch(ws)]));
    const res = await api('login', { phone, from, to: addDays(to, 6) });
    writeJson(SESSION_KEY, { token: res.token, me: res.me });
    this.set({ session: { token: res.token, me: res.me }, boot: null, weeks: {}, weekErrors: {}, bootError: null, staleError: null });
    // Older backends answer without boot/range: fall back to a separate bootstrap
    if (!res.boot) return this.loadBoot();
    this.applyBoot(res.boot);
    if (res.range) this.applyRange(weekList(from, to), res.range, startEpochs);
  }

  /** Ends the session on the server (best-effort) and forgets everything on this device. */
  async logout(beforeClear?: () => Promise<void>): Promise<void> {
    const token = this.token;
    try {
      await beforeClear?.();
      if (token) await api('logout', {}, token);
    } catch {
      /* local logout must always succeed */
    }
    this.clearLocal();
  }

  private clearLocal(): void {
    removeKey(SESSION_KEY);
    removeKey(CACHE_KEY);
    this.pending.clear();
    this.sending.clear();
    this.set({ session: null, boot: null, weeks: {}, weekErrors: {}, bootError: null, saveState: 'idle', staleError: null });
  }

  /** Roster, statuses and the first weeks in one request. */
  async loadBoot(): Promise<void> {
    const token = this.token;
    if (!token) return;
    const [from, to] = this.homeWindow();
    let rangeMissing = false;
    try {
      await this.fetchWeeks(from, to, async () => {
        const res = await this.call(() => api('bootstrap', { from, to: addDays(to, 6) }, token));
        this.applyBoot(res);
        rangeMissing = !res.range;
        return res.range;
      });
    } catch (err) {
      if (this.state.session) this.set({ bootError: errorText(err) });
    }
    // A backend without range support: screens deduped onto this request still need their weeks
    if (rangeMissing) await this.refreshVisible();
  }

  /**
   * Stale-while-revalidate: cached weeks render immediately and refresh in the background.
   * Fetches the neighbours too (one request), so moving a week back or forward is instant.
   */
  loadWeek(ws: string, force = false): Promise<void> {
    const cached = this.state.weeks[ws];
    if (!force && cached && Date.now() - cached.fetchedAt < FRESH_MS) return Promise.resolve();
    const running = this.inflight.get(ws);
    if (running) return running;
    const from = addDays(ws, -7);
    const to = addDays(ws, 7);
    return this.fetchWeeks(from, to, () => this.call(() => api('getRange', { from, to: addDays(to, 6) }, this.token))).catch(() => {});
  }

  /** useWeek registers what is on screen so background refreshes know what to fetch. */
  watch(ws: string): () => void {
    this.watched.set(ws, (this.watched.get(ws) ?? 0) + 1);
    return () => {
      const n = (this.watched.get(ws) ?? 1) - 1;
      if (n > 0) this.watched.set(ws, n);
      else this.watched.delete(ws);
    };
  }

  /** Re-fetches every week on screen now (one request when they are close together). */
  refreshVisible(): Promise<void> {
    if (!this.state.session) return Promise.resolve();
    const list = [...this.watched.keys()].sort();
    if (!list.length) return Promise.resolve();
    const first = list[0]!;
    const last = list[list.length - 1]!;
    if (weekList(first, last).length <= MAX_SPAN_WEEKS) {
      return this.fetchWeeks(first, last, () => this.call(() => api('getRange', { from: first, to: addDays(last, 6) }, this.token))).catch(() => {});
    }
    return Promise.all(list.map((ws) => this.loadWeek(ws, true))).then(() => {});
  }

  /** Periodic tick: refresh what is visible unless a request is already running or edits are unsent. */
  poll(): Promise<void> {
    if (this.reads > 0 || this.pending.size || this.sending.size) return Promise.resolve();
    return this.refreshVisible();
  }

  /** App came back to the foreground (or the network returned): bring roster and visible weeks up to date. */
  resume(): void {
    if (!this.state.session) return;
    this.set({ resumeTick: this.state.resumeTick + 1 });
    void this.refreshNow();
  }

  /** Manual or resume refresh: roster + home weeks + whatever is on screen. */
  async refreshNow(): Promise<void> {
    if (!this.state.session) return;
    await Promise.all([this.loadBoot(), this.refreshVisible()]);
  }

  /** Holidays (and entries) for an arbitrary range, used by the range-fill preview. */
  fetchRange(from: string, to: string) {
    return this.call(() => api('getRange', { from, to }, this.token));
  }

  /** Optimistic edit, batched and sent after a short pause (several quick taps become one request). */
  queueDays(memberId: string, days: DayInput[]): void {
    const forMember = this.pending.get(memberId) ?? new Map<string, DayInput>();
    for (const d of days) {
      forMember.set(d.date, d);
      const ws = weekStart(d.date);
      this.editEpoch.set(ws, this.epoch(ws) + 1);
    }
    this.pending.set(memberId, forMember);
    this.set({
      weeks: applyToWeeks(this.state.weeks, memberId, asChanges(days), this.state.session?.me.id ?? ''),
      saveState: 'saving',
    });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  /** Sends all queued edits now (also called when the app goes to the background). */
  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const batches = [...this.pending.entries()];
    this.pending.clear();
    if (!batches.length) return;
    for (const [memberId, days] of batches) this.sending.set(memberId, days);
    try {
      for (const [memberId, days] of batches) {
        const res = await this.call(() => api('setDays', { memberId, days: [...days.values()] }, this.token));
        this.sending.delete(memberId);
        this.set({ weeks: applyToWeeks(this.state.weeks, memberId, res.entries, this.state.session?.me.id ?? '') });
      }
      this.set({ saveState: this.pending.size ? 'saving' : 'saved' });
    } catch (err) {
      for (const [memberId] of batches) this.sending.delete(memberId);
      this.set({ saveState: 'error' });
      this.toast(`${errorText(err)} השינוי לא נשמר.`, 'error');
      // Server is the source of truth after a failed save: reload what we showed optimistically
      const weeks = new Set(batches.flatMap(([, days]) => [...days.keys()].map(weekStart)));
      for (const ws of weeks) this.editEpoch.set(ws, this.epoch(ws) + 1);
      await Promise.all([...weeks].map((ws) => this.loadWeek(ws, true)));
    }
  }

  /** Immediate save for bulk actions (range fill, copy week). Returns the number of days sent. */
  async saveNow(memberId: string, days: DayInput[]): Promise<number> {
    if (!days.length) return 0;
    this.queueDays(memberId, days);
    await this.flush();
    if (this.state.saveState === 'error') throw new Error('save failed');
    return days.length;
  }

  // Admin helpers keep the cached bootstrap in sync after edits
  async adminCall<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const result = await this.call(() => fn(this.token ?? ''));
    await this.loadBoot();
    return result;
  }
}

export const store = new Store();
