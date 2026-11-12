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
