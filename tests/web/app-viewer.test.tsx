// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../shared/types.ts';
import { member } from '../fixtures.ts';

const getPushState = vi.fn();
vi.mock('../../web/src/lib/push.ts', () => ({
  getPushState: () => getPushState(),
  resyncPush: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  localTestNotification: vi.fn(),
}));

vi.mock('../../web/src/data/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../web/src/data/api.ts')>()),
  api: vi.fn(async () => ({ entries: [], holidays: [] })),
}));

const TEAMMATE = member('m1', { name: 'Teammate' });
const VIEWER: Me = { id: 'v1', name: 'Viewer', type: 'regular', isAdmin: false, active: true, order: 0, readOnly: true };

async function mount(me: Me, hash = '#/today') {
  vi.resetModules();
  window.location.hash = hash;
  const { store } = await import('../../web/src/data/store.ts');
  store.state = { ...store.state, session: { token: 't'.repeat(64), me }, boot: { me, members: [TEAMMATE], statuses: [], vapidPublicKey: 'k', pushTestEnabled: false } };
  const { App } = await import('../../web/src/app.tsx');
  return render(<App />);
}

const navLabels = () => [...document.querySelectorAll('.bottom-nav .nav-item')].map((a) => a.textContent);

describe('App shell for read-only viewers', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    getPushState.mockReset().mockResolvedValue('off');
  });
  afterEach(cleanup);

  it('hides "my week", marks the session read-only and never asks for notifications', async () => {
    await mount(VIEWER);
    expect(navLabels()).toEqual(['היום', 'שבוע', 'עוד']);
    expect(screen.getByText('צפייה בלבד')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 0));
    expect(getPushState).not.toHaveBeenCalled();
  });

  it('sends a "my week" link to today', async () => {
    await mount(VIEWER, '#/me/2026-11-22');
    expect(screen.getByRole('button', { name: 'יום קודם' })).toBeTruthy();
    expect(screen.queryByText('📋 כמו שבוע שעבר')).toBeNull();
  });

  it('team members keep the full navigation', async () => {
    await mount(TEAMMATE);
    expect(navLabels()).toEqual(['היום', 'שבוע', 'השבוע שלי', 'עוד']);
    expect(screen.queryByText('צפייה בלבד')).toBeNull();
    await waitFor(() => expect(getPushState).toHaveBeenCalled());
  });
});
