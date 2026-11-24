import { useEffect, useState } from 'preact/hooks';
import type { ViewerInput } from '../../../../shared/api.ts';
import { formatPhone } from '../../../../shared/phone.ts';
import type { Viewer } from '../../../../shared/types.ts';
import { BottomSheet } from '../../components/BottomSheet.tsx';
import { ErrorBox, Loading } from '../../components/Feedback.tsx';
import { api } from '../../data/api.ts';
import { store } from '../../data/store.ts';
import { errorText } from './common.tsx';

/** Read-only accounts: people outside the team who log in by phone to see where everyone is. */
export function ViewersTab() {
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Viewer | 'new' | null>(null);
  const load = () => {
    setError('');
    store.adminCall((token) => api('adminViewers', {}, token)).then((r) => setViewers(r.viewers), (err) => setError(errorText(err)));
  };
  useEffect(load, []);
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!viewers) return <Loading />;
  const done = () => {
    setEditing(null);
    load();
  };
  return (
    <>
      <p class="muted">צופים נכנסים עם מספר הטלפון ורואים את כל המסכים בלי אפשרות לעדכן. הם לא חלק מהצוות ולא מקבלים תזכורות.</p>
      <button type="button" class="btn is-primary is-block" onClick={() => setEditing('new')}>+ הוספת צופה</button>
      {viewers.length === 0 ? (
        <p class="muted">עוד אין צופים.</p>
      ) : (
        <ul class="admin-list">
          {viewers.map((v) => (
            <li key={v.id}>
              <button type="button" class="admin-row" onClick={() => setEditing(v)}>
                <strong>{v.name}</strong>
                <span class="muted" dir="ltr">{v.phone ? formatPhone(v.phone) : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ViewerForm viewer={editing} onClose={() => setEditing(null)} onSaved={done} />
    </>
  );
}

function ViewerForm({ viewer, onClose, onSaved }: { viewer: Viewer | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const blank: ViewerInput = { name: '', phone: '' };
  const [form, setForm] = useState<ViewerInput>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    setForm(viewer && viewer !== 'new' ? { id: viewer.id, name: viewer.name, phone: viewer.phone ?? '' } : blank);
  }, [viewer]);

  // Shared busy/error handling for save and delete
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError('');
    try {
      store.toast(await fn(), 'success');
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      await store.adminCall((token) => api('saveViewer', { viewer: form }, token));
      return 'נשמר';
    });
  };

  const remove = () => {
    const id = form.id;
    if (!id || !window.confirm(`למחוק את ${form.name}? הצופה ינותק/תנותק מכל המכשירים.`)) return;
    void run(async () => {
      await store.adminCall((token) => api('deleteViewer', { viewerId: id }, token));
      return 'נמחק';
    });
  };

  const set = <K extends keyof ViewerInput>(key: K, value: ViewerInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <BottomSheet open={viewer !== null} onClose={onClose} title={viewer === 'new' ? 'צופה חדש/ה' : 'עריכת צופה'}>
      <form class="form" onSubmit={save}>
        <label class="field">
          <span class="field-label">שם</span>
          <input class="input" value={form.name} maxLength={40} required onInput={(e) => set('name', (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span class="field-label">טלפון (משמש לכניסה)</span>
          <input class="input" type="tel" inputMode="numeric" dir="ltr" value={form.phone} required onInput={(e) => set('phone', (e.target as HTMLInputElement).value)} />
        </label>
        {error && <p class="hint is-error" role="alert">{error}</p>}
        <button class="btn is-primary is-block" type="submit" disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
        {form.id && <button class="btn is-danger is-block" type="button" disabled={busy} onClick={remove}>מחיקת צופה</button>}
      </form>
    </BottomSheet>
  );
}
