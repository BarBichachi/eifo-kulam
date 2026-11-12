import { useEffect, useState } from 'preact/hooks';
import type { MemberInput } from '../../../../shared/api.ts';
import { formatPhone } from '../../../../shared/phone.ts';
import { MEMBER_TYPE_LABELS } from '../../../../shared/statuses.ts';
import type { Member } from '../../../../shared/types.ts';
import { BottomSheet } from '../../components/BottomSheet.tsx';
import { api } from '../../data/api.ts';
import { store } from '../../data/store.ts';
import { OrderButtons, errorText, moved, saveOrder } from './common.tsx';

/** Roster list with ordering, plus the add/edit form. */
export function MembersTab({ members }: { members: Member[] }) {
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const move = async (index: number, step: -1 | 1) => {
    setBusy(true);
    try {
      await saveOrder('members', moved(members, index, step));
    } catch (err) {
      store.toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" class="btn is-primary is-block" onClick={() => setEditing('new')}>+ הוספת חבר/ת צוות</button>
      <ul class="admin-list">
        {members.map((m, i) => (
          <li key={m.id} class={m.active ? '' : 'is-inactive'}>
            <button type="button" class="admin-row" onClick={() => setEditing(m)}>
              <strong>{m.name}</strong>
              <span class="muted" dir="ltr">{m.phone ? formatPhone(m.phone) : ''}</span>
              <span class="tags">
                <span class="tag">{MEMBER_TYPE_LABELS[m.type]}</span>
                {m.isAdmin && <span class="tag is-accent">מנהל/ת</span>}
                {!m.active && <span class="tag is-muted">לא פעיל/ה</span>}
              </span>
            </button>
            <OrderButtons onMove={(s) => void move(i, s)} first={i === 0} last={i === members.length - 1} disabled={busy} />
          </li>
        ))}
      </ul>
      <MemberForm member={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function MemberForm({ member, onClose }: { member: Member | 'new' | null; onClose: () => void }) {
  const blank: MemberInput = { name: '', phone: '', type: 'regular', isAdmin: false, active: true };
  const [form, setForm] = useState<MemberInput>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    setForm(member && member !== 'new' ? { id: member.id, name: member.name, phone: member.phone ?? '', type: member.type, isAdmin: member.isAdmin, active: member.active, order: member.order } : blank);
  }, [member]);

  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await store.adminCall((token) => api('saveMember', { member: form }, token));
      store.toast('נשמר', 'success');
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!form.id || !window.confirm(`לנתק את ${form.name} מכל המכשירים?`)) return;
    try {
      const { revoked } = await store.adminCall((token) => api('revokeSessions', { memberId: form.id! }, token));
      store.toast(`נותקו ${revoked} מכשירים`, 'success');
    } catch (err) {
      setError(errorText(err));
    }
  };

  const set = <K extends keyof MemberInput>(key: K, value: MemberInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <BottomSheet open={member !== null} onClose={onClose} title={member === 'new' ? 'חבר/ת צוות חדש/ה' : 'עריכת חבר/ת צוות'}>
      <form class="form" onSubmit={save}>
        <label class="field">
          <span class="field-label">שם</span>
          <input class="input" value={form.name} maxLength={40} required onInput={(e) => set('name', (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span class="field-label">טלפון (משמש לכניסה)</span>
          <input class="input" type="tel" inputMode="numeric" dir="ltr" value={form.phone} required onInput={(e) => set('phone', (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span class="field-label">סוג</span>
          <select class="input" value={form.type} onChange={(e) => set('type', (e.target as HTMLSelectElement).value as Member['type'])}>
            <option value="regular">{MEMBER_TYPE_LABELS.regular} (ברירת מחדל: במשרד)</option>
            <option value="student">{MEMBER_TYPE_LABELS.student} (ברירת מחדל: לא מגיע/ה)</option>
          </select>
        </label>
        <label class="check">
          <input type="checkbox" checked={form.isAdmin} onChange={(e) => set('isAdmin', (e.target as HTMLInputElement).checked)} />
          מנהל/ת (עריכת כולם וניהול)
        </label>
        <label class="check">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', (e.target as HTMLInputElement).checked)} />
          פעיל/ה (לא פעיל = מוסתר ולא יכול להתחבר, ההיסטוריה נשמרת)
        </label>
        {error && <p class="hint is-error" role="alert">{error}</p>}
        <button class="btn is-primary is-block" type="submit" disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
        {form.id && <button class="btn is-ghost is-block" type="button" onClick={revoke}>ניתוק מכל המכשירים</button>}
      </form>
    </BottomSheet>
  );
}
