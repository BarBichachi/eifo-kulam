// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPushState = vi.fn();
const resyncPush = vi.fn();
vi.mock('../../web/src/lib/push.ts', () => ({
  getPushState: () => getPushState(),
  resyncPush: (t: string) => resyncPush(t),
  enablePush: vi.fn(),
}));

const ME = { id: 'm1', name: 'Me', type: 'regular' as const, isAdmin: false, active: true, order: 1 };

// Fresh modules per test: the prompt remembers "already shown" for the lifetime of the app
async function mount() {
  vi.resetModules();
  const { store } = await import('../../web/src/data/store.ts');
  store.state = { ...store.state, session: { token: 't'.repeat(64), me: ME }, boot: { me: ME, members: [ME], statuses: [], vapidPublicKey: 'k', pushTestEnabled: false } };
  const { NotifyPrompt } = await import('../../web/src/components/NotifyPrompt.tsx');
  return render(<NotifyPrompt />);
}

describe('NotifyPrompt', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    getPushState.mockReset();
    resyncPush.mockReset().mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('asks to turn notifications on when they are off', async () => {
    getPushState.mockResolvedValue('off');
    await mount();
    expect(await screen.findByRole('button', { name: 'הפעלת התראות' })).toBeTruthy();
  });

  it('explains home-screen install on an iPhone browser tab', async () => {
    getPushState.mockResolvedValue('needs-install');
    await mount();
    expect(await screen.findByText(/הוספה למסך הבית/)).toBeTruthy();
  });

  it('stays quiet and re-registers the device when notifications are already on', async () => {
    getPushState.mockResolvedValue('on');
    await mount();
    await waitFor(() => expect(resyncPush).toHaveBeenCalledWith('t'.repeat(64)));
    expect(screen.queryByRole('button', { name: 'הפעלת התראות' })).toBeNull();
  });
});
