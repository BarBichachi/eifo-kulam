import { useStore } from '../data/hooks.ts';
import { store } from '../data/store.ts';
import { IconRefresh } from './Icons.tsx';

/** Refresh control in the top bar: spinner while syncing, a warning when shown data could not be updated. */
export function SyncStatus() {
  const refreshing = useStore((s) => s.refreshing);
  const staleError = useStore((s) => s.staleError);
  const refresh = () => void store.refreshNow();
  if (refreshing) {
    return (
      <span class="sync is-busy" role="status" aria-label="מתעדכן">
        <span class="spinner is-small" aria-hidden="true" />
      </span>
    );
  }
  if (staleError) {
    return (
      <button type="button" class="sync is-stale" onClick={refresh} title={staleError}>
        ⚠ לא מעודכן · נסו שוב
      </button>
    );
  }
  return (
    <button type="button" class="sync icon-btn" onClick={refresh} aria-label="רענון">
      <IconRefresh />
    </button>
  );
}

/** Global toast + autosave status, announced to screen readers. */
export function Toasts() {
  const toast = useStore((s) => s.toast);
  const saveState = useStore((s) => s.saveState);
  return (
    <>
      <div class="save-state" aria-live="polite" data-state={saveState}>
        {saveState === 'saving' ? 'שומר…' : saveState === 'saved' ? 'נשמר ✓' : saveState === 'error' ? 'לא נשמר' : ''}
      </div>
      <div class="toast-region" aria-live="assertive">
        {toast && <div key={toast.id} class={`toast is-${toast.kind}`}>{toast.text}</div>}
      </div>
    </>
  );
}

export function Loading({ label = 'טוען…' }: { label?: string }) {
  return (
    <div class="loading" role="status">
      <span class="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div class="error-box" role="alert">
      <p>{message}</p>
      {onRetry && <button type="button" class="btn" onClick={onRetry}>נסו שוב</button>}
    </div>
  );
}
