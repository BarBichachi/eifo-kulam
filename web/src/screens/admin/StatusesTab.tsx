import { useEffect, useState } from 'preact/hooks';
import type { StatusInput } from '../../../../shared/api.ts';
import { CATEGORIES, CATEGORY_LABELS, PALETTE } from '../../../../shared/statuses.ts';
import type { Status } from '../../../../shared/types.ts';
import { BottomSheet } from '../../components/BottomSheet.tsx';
import { StatusPill } from '../../components/StatusPill.tsx';
import { api } from '../../data/api.ts';
import { store } from '../../data/store.ts';
import { OrderButtons, errorText, moved, saveOrder } from './common.tsx';

/** Status options with ordering, plus the add/edit form. */
export function StatusesTab({ statuses }: { statuses: Status[] }) {
  const [editing, setEditing] = useState<Status | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const move = async (index: number, step: -1 | 1) => {
    setBusy(true);
    try {
      await saveOrder('statuses', moved(statuses, index, step));
    } catch (err) {
      store.toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p class="muted">סטטוס שהוצא משימוש נעלם מהבחירה, אבל ימים שכבר סומנו בו ממשיכים להופיע.</p>
      <button type="button" class="btn is-primary is-block" onClick={() => setEditing('new')}>+ סטטוס חדש</button>
      <ul class="admin-list">
        {statuses.map((s, i) => (
          <li key={s.id} class={s.active ? '' : 'is-inactive'}>
            <button type="button" class="admin-row" onClick={() => setEditing(s)}>
              <StatusPill status={s} />
              <span class="tags">
                <span class="tag">{CATEGORY_LABELS[s.category]}</span>
                {s.requiresNote && <span class="tag">חובה הערה</span>}
                {!s.active && <span class="tag is-muted">לא בשימוש</span>}
              </span>
            </button>
            <OrderButtons onMove={(st) => void move(i, st)} first={i === 0} last={i === statuses.length - 1} disabled={busy} />
          </li>
        ))}
      </ul>
      <StatusForm status={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function StatusForm({ status, onClose }: { status: Status | 'new' | null; onClose: () => void }) {
  const blank: StatusInput = { label: '', emoji: '📍', color: 'blue', category: 'elsewhere', requiresNote: false, active: true };
  const [form, setForm] = useState<StatusInput>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    setForm(status && status !== 'new' ? { ...status } : blank);
  }, [status]);

  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await store.adminCall((token) => api('saveStatus', { status: form }, token));
      store.toast('נשמר', 'success');
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof StatusInput>(key: K, value: StatusInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const preview: Status = { id: 'preview', order: 0, ...form, label: form.label || 'תצוגה מקדימה' };
  return (
    <BottomSheet open={status !== null} onClose={onClose} title={status === 'new' ? 'סטטוס חדש' : 'עריכת סטטוס'}>
      <form class="form" onSubmit={save}>
        <div class="preview-line"><StatusPill status={preview} /></div>
        <div class="form-row">
          <label class="field is-narrow">
            <span class="field-label">אימוג׳י</span>
            <input class="input emoji-input" value={form.emoji} maxLength={8} required onInput={(e) => set('emoji', (e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span class="field-label">שם</span>
            <input class="input" value={form.label} maxLength={30} required onInput={(e) => set('label', (e.target as HTMLInputElement).value)} />
          </label>
        </div>
        <fieldset class="field">
          <legend class="field-label">צבע</legend>
          <div class="swatches">
            {PALETTE.map((c) => (
              <button key={c} type="button" class={`swatch tone-${c}${form.color === c ? ' is-selected' : ''}`} aria-label={c} aria-pressed={form.color === c} onClick={() => set('color', c)} />
            ))}
          </div>
        </fieldset>
        <label class="field">
          <span class="field-label">קטגוריה (קובעת את הספירה במשרד)</span>
          <select class="input" value={form.category} onChange={(e) => set('category', (e.target as HTMLSelectElement).value as Status['category'])}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label class="check">
          <input type="checkbox" checked={form.requiresNote} onChange={(e) => set('requiresNote', (e.target as HTMLInputElement).checked)} />
          חובה לכתוב הערה
        </label>
        <label class="check">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', (e.target as HTMLInputElement).checked)} />
          בשימוש (מופיע בבחירה)
        </label>
        {error && <p class="hint is-error" role="alert">{error}</p>}
        <button class="btn is-primary is-block" type="submit" disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </form>
    </BottomSheet>
  );
}
