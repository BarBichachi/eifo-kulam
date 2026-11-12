import { useEffect, useState } from 'preact/hooks';
import { addDays, daysBetween, formatFull, isIsoDate } from '../../../shared/dates.ts';
import { MAX_RANGE_DAYS } from '../../../shared/api.ts';
import { NOTE_MAX } from '../../../shared/statuses.ts';
import { sortStatuses } from '../../../shared/status.ts';
import type { Member, Status } from '../../../shared/types.ts';
import { indexHolidays, rangeDays } from '../../../shared/week.ts';
import { store } from '../data/store.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { StatusPicker } from './StatusPicker.tsx';

interface Props {
  open: boolean;
  member: Member;
  statuses: Status[];
  defaultFrom: string;
  onClose: () => void;
}

/** One status (e.g. vacation) over a date range; weekends and day-off holidays are skipped. */
export function RangeSheet({ open, member, statuses, defaultFrom, onClose }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(addDays(defaultFrom, 4));
  const [status, setStatus] = useState<Status | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFrom(defaultFrom);
    setTo(addDays(defaultFrom, 4));
    setStatus(null);
    setNote('');
    setError('');
  }, [open, defaultFrom]);

  const rangeError = !isIsoDate(from) || !isIsoDate(to)
    ? 'בחרו תאריכים'
    : to < from
      ? 'תאריך הסיום לפני תאריך ההתחלה'
      : daysBetween(from, to) > MAX_RANGE_DAYS
        ? 'אפשר לסמן עד שנה בבת אחת'
        : '';

  const apply = async () => {
    if (rangeError || !status) return;
    if (status.requiresNote && !note.trim()) {
      setError(`בסטטוס "${status.label}" צריך לכתוב הערה`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { holidays } = await store.fetchRange(from, to);
      const days = rangeDays(from, to, indexHolidays(holidays), status.id, note.trim());
      if (!days.length) {
        setError('אין ימי עבודה בטווח שנבחר');
        return;
      }
      const count = await store.saveNow(member.id, days);
      store.toast(`עודכנו ${count} ימי עבודה (${formatFull(from)} - ${formatFull(to)})`, 'success');
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message !== 'save failed' ? err.message : 'השמירה נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="סימון טווח תאריכים"
      footer={
        <button type="button" class="btn is-primary is-block" disabled={busy || !!rangeError || !status} onClick={apply}>
          {busy ? 'שומר…' : status ? `סימון "${status.label}" בטווח` : 'בחרו סטטוס'}
        </button>
      }
    >
      <div class="range-dates">
        <label class="field">
          <span class="field-label">מתאריך</span>
          <input class="input" type="date" value={from} onChange={(e) => setFrom((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span class="field-label">עד תאריך</span>
          <input class="input" type="date" value={to} min={from} onChange={(e) => setTo((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      {rangeError ? <p class="hint is-warning">{rangeError}</p> : <p class="muted">שישי, שבת וחגים מדולגים אוטומטית.</p>}
      <StatusPicker statuses={sortStatuses(statuses)} selectedId={status?.id ?? null} onPick={setStatus} />
      <label class="field">
        <span class="field-label">הערה (לא חובה)</span>
        <input class="input" maxLength={NOTE_MAX} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} placeholder="למשל: טיסה לחו״ל" />
      </label>
      {error && <p class="hint is-error" role="alert">{error}</p>}
    </BottomSheet>
  );
}
