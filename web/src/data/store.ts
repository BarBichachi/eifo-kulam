import type { Bootstrap } from '../../../shared/api.ts';
import { addDays, weekStart } from '../../../shared/dates.ts';
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
  /** Bumped when the app returns to the foreground so visible screens refresh. */
  resumeTick: number;
}

const SESSION_KEY = 'session';
const CACHE_KEY = 'cache';
/** A cached week younger than this is not re-fetched on navigation. */
const FRESH_MS = 60_000;
const SAVE_DEBOUNCE_MS = 700;
const MAX_CACHED_WEEKS = 16;

interface PersistedCache {
  memberId: string;
  boot: Bootstrap | null;
  weeks: Record<string, WeekData>;
}

/** Replaces the member's row for each day inside the cached weeks (empty statusId removes it). */
function applyToWeeks(weeks: Record<string, WeekData>, memberId: string, changes: Pick<Entry, 'date' | 'statusId' | 'note'>[], actorId: string) {
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

/** App state container: session, cached data, optimistic saves. UI subscribes via useStore. */
export class Store {
  state: State;
  private listeners = new Set<() => void>();
  private pending = new Map<string, Map<string, DayInput>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight = new Map<string, Promise<void>>();
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
    };
  }

  /** App came back to the foreground: refresh the roster and whatever week is on screen. */
  resume(): void {
    if (!this.state.session) return;
    void this.loadBoot();
    this.set({ resumeTick: this.state.resumeTick + 1 });
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

  async login(phone: string): Promise<void> {
    const { token, me } = await api('login', { phone });
    const session = { token, me };
    writeJson(SESSION_KEY, session);
    this.set({ session, boot: null, weeks: {}, weekErrors: {}, bootError: null });
    await this.loadBoot();
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
    this.set({ session: null, boot: null, weeks: {}, weekErrors: {}, bootError: null, saveState: 'idle' });
  }

  async loadBoot(): Promise<void> {
    if (!this.token) return;
    try {
      const boot = await this.call(() => api('bootstrap', {}, this.token));
      const session = { token: this.token!, me: boot.me };
      writeJson(SESSION_KEY, session);
      this.set({ boot, session, bootError: null });
    } catch (err) {
      if (this.state.session) this.set({ bootError: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Stale-while-revalidate: cached weeks render immediately, then refresh in the background. */
  loadWeek(ws: string, force = false): Promise<void> {
    const cached = this.state.weeks[ws];
    if (!force && cached && Date.now() - cached.fetchedAt < FRESH_MS) return Promise.resolve();
    const running = this.inflight.get(ws);
    if (running) return running;
    const p = (async () => {
      try {
        const data = await this.call(() => api('getRange', { from: ws, to: addDays(ws, 6) }, this.token));
        // Keep optimistic edits that are still waiting to be sent
        let weeks = { ...this.state.weeks, [ws]: { ...data, fetchedAt: Date.now() } };
        for (const [memberId, days] of this.pending) {
          weeks = applyToWeeks(weeks, memberId, [...days.values()].map((d) => ({ ...d, statusId: d.statusId ?? '' })), this.state.session?.me.id ?? '');
        }
        const weekErrors = { ...this.state.weekErrors };
        delete weekErrors[ws];
        this.set({ weeks, weekErrors });
      } catch (err) {
        if (this.state.session) this.set({ weekErrors: { ...this.state.weekErrors, [ws]: err instanceof Error ? err.message : String(err) } });
      } finally {
        this.inflight.delete(ws);
      }
    })();
    this.inflight.set(ws, p);
    return p;
  }

  /** Holidays (and entries) for an arbitrary range, used by the range-fill preview. */
  fetchRange(from: string, to: string) {
    return this.call(() => api('getRange', { from, to }, this.token));
  }

  /** Optimistic edit, batched and sent after a short pause (several quick taps become one request). */
  queueDays(memberId: string, days: DayInput[]): void {
    const forMember = this.pending.get(memberId) ?? new Map<string, DayInput>();
    for (const d of days) forMember.set(d.date, d);
    this.pending.set(memberId, forMember);
    this.set({
      weeks: applyToWeeks(this.state.weeks, memberId, days.map((d) => ({ ...d, statusId: d.statusId ?? '' })), this.state.session?.me.id ?? ''),
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
    try {
      for (const [memberId, days] of batches) {
        const res = await this.call(() => api('setDays', { memberId, days: [...days.values()] }, this.token));
        this.set({ weeks: applyToWeeks(this.state.weeks, memberId, res.entries, this.state.session?.me.id ?? '') });
      }
      this.set({ saveState: this.pending.size ? 'saving' : 'saved' });
    } catch (err) {
      this.set({ saveState: 'error' });
      this.toast(`${err instanceof Error ? err.message : String(err)} השינוי לא נשמר.`, 'error');
      // Server is the source of truth after a failed save: reload what we showed optimistically
      const weeks = new Set(batches.flatMap(([, days]) => [...days.keys()].map(weekStart)));
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
