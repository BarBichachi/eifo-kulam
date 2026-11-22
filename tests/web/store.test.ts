// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../shared/types.ts';

const apiMock = vi.fn();
vi.mock('../../web/src/data/api.ts', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

const { Store } = await import('../../web/src/data/store.ts');
const { ApiError } = await import('../../web/src/data/api.ts');

const WS = '2026-11-15';
const ME = { id: 'm1', name: 'Me', type: 'regular' as const, isAdmin: false, active: true, order: 1 };
const entry = (date: string, statusId: string, note = ''): Entry => ({ date, memberId: 'm1', statusId, note, updatedAt: 'x', updatedBy: 'm1' });

function loggedInStore() {
  localStorage.setItem('eifo:session', JSON.stringify({ token: 't'.repeat(64), me: ME }));
  const store = new Store();
  store.state.weeks = { [WS]: { entries: [entry('2026-11-15', 'home')], holidays: [], fetchedAt: Date.now() } };
  return store;
}

describe('Store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    apiMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('applies edits optimistically and batches quick taps into one request', async () => {
    const store = loggedInStore();
    apiMock.mockResolvedValue({ entries: [entry('2026-11-16', 'vacation'), entry('2026-11-17', 'sick')] });
    store.queueDays('m1', [{ date: '2026-11-16', statusId: 'office', note: '' }]);
    store.queueDays('m1', [{ date: '2026-11-16', statusId: 'vacation', note: '' }, { date: '2026-11-17', statusId: 'sick', note: '' }]);
    store.queueDays('m1', [{ date: '2026-11-15', statusId: null, note: '' }]);

    const shown = store.state.weeks[WS]!.entries.map((e) => `${e.date}:${e.statusId}`).sort();
    expect(shown).toEqual(['2026-11-16:vacation', '2026-11-17:sick']);
    expect(store.state.saveState).toBe('saving');
    expect(apiMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(800);
    expect(apiMock).toHaveBeenCalledTimes(1);
    const [action, req] = apiMock.mock.calls[0]!;
    expect(action).toBe('setDays');
    expect(req.days).toEqual([
      { date: '2026-11-16', statusId: 'vacation', note: '' },
      { date: '2026-11-17', statusId: 'sick', note: '' },
      { date: '2026-11-15', statusId: null, note: '' },
    ]);
    expect(store.state.saveState).toBe('saved');
  });

  it('on a failed save, shows the error and reloads the week from the server', async () => {
    const store = loggedInStore();
    apiMock.mockImplementation(async (action: string) => {
      if (action === 'setDays') throw new ApiError('BAD_REQUEST', 'סטטוס לא קיים');
      return { entries: [entry('2026-11-15', 'home')], holidays: [] };
    });
    store.queueDays('m1', [{ date: '2026-11-15', statusId: 'nope', note: '' }]);
    await vi.advanceTimersByTimeAsync(800);
    expect(store.state.saveState).toBe('error');
    expect(store.state.toast?.text).toContain('סטטוס לא קיים');
    expect(store.state.weeks[WS]!.entries.map((e) => e.statusId)).toEqual(['home']);
  });

  it('an expired session logs the device out', async () => {
    const store = loggedInStore();
    apiMock.mockRejectedValue(new ApiError('UNAUTHORIZED', 'החיבור פג'));
    await store.loadWeek('2026-11-22');
    expect(store.state.session).toBeNull();
    expect(localStorage.getItem('eifo:session')).toBeNull();
  });

  it('does not show another user cached data after a different login', () => {
    localStorage.setItem('eifo:session', JSON.stringify({ token: 't'.repeat(64), me: ME }));
    localStorage.setItem('eifo:cache', JSON.stringify({ memberId: 'someone-else', boot: { me: {} }, weeks: { [WS]: {} } }));
    const store = new Store();
    expect(store.state.boot).toBeNull();
    expect(store.state.weeks).toEqual({});
  });
});

describe('Store: loading and freshness', () => {
  const BOOT = { me: ME, members: [ME], statuses: [], vapidPublicKey: '', pushTestEnabled: false };
  // Resolves when the test calls the returned function: lets a test interleave a read with an edit
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T08:00:00Z'));
    localStorage.clear();
    apiMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('loads roster and last/this/next week in one request; screens share it', async () => {
    const store = loggedInStore();
    store.state.weeks = {};
    apiMock.mockResolvedValue({ ...BOOT, range: { entries: [entry('2026-11-10', 'sick'), entry('2026-11-24', 'home')], holidays: [] } });
    const boot = store.loadBoot();
    const screen = store.loadWeek('2026-11-22');
    await Promise.all([boot, screen]);
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock.mock.calls[0]![1]).toEqual({ from: '2026-11-08', to: '2026-11-28' });
    expect(Object.keys(store.state.weeks).sort()).toEqual(['2026-11-08', '2026-11-15', '2026-11-22']);
    expect(store.state.weeks['2026-11-22']!.entries.map((e) => e.statusId)).toEqual(['home']);
  });

  it('login returns everything needed to render in a single round trip', async () => {
    const store = new Store();
    apiMock.mockResolvedValue({ token: 't'.repeat(64), me: ME, boot: BOOT, range: { entries: [entry('2026-11-16', 'vacation')], holidays: [] } });
    await store.login('0541112233');
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(store.state.boot).toEqual(BOOT);
    expect(store.state.weeks[WS]!.entries.map((e) => e.statusId)).toEqual(['vacation']);
  });

  it('a read that started before my edit does not overwrite it', async () => {
    const store = loggedInStore();
    const read = deferred<unknown>();
    apiMock.mockImplementation((action: string) => (action === 'getRange' ? read.promise : Promise.resolve({ entries: [entry('2026-11-16', 'sick')] })));
    const loading = store.loadWeek(WS, true);
    store.queueDays('m1', [{ date: '2026-11-16', statusId: 'sick', note: '' }]);
    await vi.advanceTimersByTimeAsync(800);
    read.resolve({ entries: [entry('2026-11-15', 'home')], holidays: [] });
    await loading;
    expect(store.state.weeks[WS]!.entries.find((e) => e.date === '2026-11-16')?.statusId).toBe('sick');
    expect(store.state.weeks[WS]!.fetchedAt).toBe(0);
  });

  it('polling re-fetches the weeks on screen so other people\'s changes appear', async () => {
    const store = loggedInStore();
    const unwatch = store.watch(WS);
    apiMock.mockResolvedValue({ entries: [entry('2026-11-15', 'home'), { ...entry('2026-11-16', 'reserve'), memberId: 'm2' }], holidays: [] });
    await store.poll();
    expect(apiMock).toHaveBeenCalledWith('getRange', { from: WS, to: '2026-11-21' }, 't'.repeat(64));
    expect(store.state.weeks[WS]!.entries.some((e) => e.memberId === 'm2')).toBe(true);
    unwatch();
    apiMock.mockClear();
    await store.poll();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('a failed background refresh keeps the data and flags it as not updated', async () => {
    const store = loggedInStore();
    store.watch(WS);
    apiMock.mockRejectedValue(new ApiError('NETWORK', 'אין חיבור לשרת'));
    await store.refreshVisible();
    expect(store.state.weeks[WS]!.entries.map((e) => e.statusId)).toEqual(['home']);
    expect(store.state.staleError).toBe('אין חיבור לשרת');
    apiMock.mockResolvedValue({ entries: [], holidays: [] });
    await store.refreshVisible();
    expect(store.state.staleError).toBeNull();
  });
});
