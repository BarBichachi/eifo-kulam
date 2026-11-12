import { useStore } from '../data/hooks.ts';

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
