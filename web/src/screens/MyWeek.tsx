import { useState } from 'preact/hooks';
import { addDays, formatDayShort, isIsoDate, israelToday, nextWeekStart, weekStart, workDays } from '../../../shared/dates.ts';
import { DEFAULT_STATUS } from '../../../shared/statuses.ts';
import { effectiveDay, isFilled, resolveStatus } from '../../../shared/status.ts';
import { copyWeekDays, entryKey, fillableDays, indexEntries, wholeWeekDays } from '../../../shared/week.ts';
import { DaySheet, type DayTarget } from '../components/DaySheet.tsx';
import { ErrorBox, Loading } from '../components/Feedback.tsx';
import { RangeSheet } from '../components/RangeSheet.tsx';
import { StatusPill } from '../components/StatusPill.tsx';
import { WeekNav } from '../components/WeekNav.tsx';
import { useStatusMap, useStore, useWeek } from '../data/hooks.ts';
import { store } from '../data/store.ts';
import { navigate } from '../lib/router.ts';

/** My week (next week by default): quick fills, copy last week, date range, and per-day editing. */
export function MyWeek({ param }: { param?: string }) {
  const ws = weekStart(isIsoDate(param) ? param : nextWeekStart(israelToday()));
  const boot = useStore((s) => s.boot)!;
  const statusMap = useStatusMap();
  const [editingId, setEditingId] = useState(boot.me.id);
  const member = boot.members.find((m) => m.id === editingId) ?? boot.me;
  const { loaded, error, entries, holidays } = useWeek(ws);
  const prev = useWeek(addDays(ws, -7));
  const [target, setTarget] = useState<DayTarget | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const days = workDays(ws);
  const fillable = fillableDays(ws, holidays);
  const filledCount = fillable.filter((d) => isFilled(entries.get(entryKey(d, member.id)))).length;
  const isMe = member.id === boot.me.id;

  // Bulk actions save immediately and report the result
  const bulk = async (label: string, run: () => Promise<number>) => {
    setBusy(true);
    try {
      const n = await run();
      store.toast(n ? `${label}: עודכנו ${n} ימים` : 'אין מה לעדכן', n ? 'success' : 'info');
    } catch {
      /* the store already showed the error */
    } finally {
      setBusy(false);
    }
  };

  const fillWeek = (statusId: string | null) => store.saveNow(member.id, wholeWeekDays(ws, holidays, statusId));

  const copyPrevious = () =>
    bulk('העתקה משבוע קודם', async () => {
      const prevWs = addDays(ws, -7);
      if (!prev.loaded) await store.loadWeek(prevWs, true);
      const prevWeek = store.state.weeks[prevWs];
      if (!prevWeek) throw new Error('missing previous week');
      const changes = copyWeekDays(member.id, prevWs, ws, indexEntries(prevWeek.entries), holidays);
      if (filledCount && !window.confirm('השבוע הזה כבר מעודכן חלקית. להחליף אותו בשבוע הקודם?')) return 0;
      return store.saveNow(member.id, changes);
    });

  const resetWeek = () => {
    if (!window.confirm('לאפס את כל השבוע לברירת המחדל?')) return;
    void bulk('איפוס', () => fillWeek(null));
  };

  const defaultId = DEFAULT_STATUS[member.type];
  const confirmLabel = defaultId === 'office' ? '🏢 כל השבוע במשרד' : '➖ כל השבוע לא מגיע/ה';
  const otherId = defaultId === 'office' ? 'not_coming' : 'office';
  const otherLabel = otherId === 'office' ? '🏢 כל השבוע במשרד' : '➖ כל השבוע לא מגיע/ה';

  return (
    <section class="screen">
      <header class="screen-head">
        <h1 class="screen-title">{isMe ? 'השבוע שלי' : `עריכה: ${member.name}`}</h1>
        {boot.me.isAdmin && (
          <select class="input is-compact" value={editingId} onChange={(e) => setEditingId((e.target as HTMLSelectElement).value)} aria-label="עריכה עבור">
            {boot.members.filter((m) => m.active).map((m) => (
              <option key={m.id} value={m.id}>{m.id === boot.me.id ? `${m.name} (אני)` : m.name}</option>
            ))}
          </select>
        )}
      </header>
      <WeekNav ws={ws} onChange={(next) => navigate(`/me/${next}`)} />

      {error && !loaded && <ErrorBox message={error} onRetry={() => void store.loadWeek(ws, true)} />}
      {!loaded && !error && <Loading />}
      {loaded && (
        <>
          <p class={`fill-status ${filledCount === fillable.length ? 'is-done' : filledCount ? 'is-partial' : 'is-empty'}`}>
            {fillable.length === 0
              ? 'כל השבוע חג 🎉'
              : filledCount === fillable.length
                ? `✓ השבוע מעודכן (${filledCount}/${fillable.length})`
                : filledCount
                  ? `עודכנו ${filledCount} מתוך ${fillable.length} ימים. השאר יוצגו כברירת מחדל.`
                  : 'השבוע עוד לא עודכן. גם אם הכל כרגיל, אשרו בלחיצה:'}
          </p>
          <div class="quick-actions">
            <button type="button" class="btn is-primary" disabled={busy || !fillable.length} onClick={() => void bulk('אישור שבוע', () => fillWeek(defaultId))}>
              {confirmLabel}
            </button>
            <button type="button" class="btn" disabled={busy || !fillable.length} onClick={() => void bulk('עדכון שבוע', () => fillWeek(otherId))}>
              {otherLabel}
            </button>
            <button type="button" class="btn" disabled={busy} onClick={copyPrevious}>📋 כמו שבוע שעבר</button>
            <button type="button" class="btn" disabled={busy} onClick={() => setRangeOpen(true)}>📅 טווח תאריכים</button>
            {filledCount > 0 && <button type="button" class="btn is-ghost" disabled={busy} onClick={resetWeek}>איפוס השבוע</button>}
          </div>

          <ul class="day-cards">
            {days.map((date) => {
              const entry = entries.get(entryKey(date, member.id));
              const holiday = holidays.get(date);
              const day = effectiveDay(member, entry, holiday);
              const status = resolveStatus(statusMap, day.statusId);
              return (
                <li key={date}>
                  <button type="button" class={`day-card${date === israelToday() ? ' is-today' : ''}`} onClick={() => setTarget({ memberId: member.id, date })}>
                    <span class="day-card-date">
                      <strong>{formatDayShort(date)}</strong>
                      {holiday && <span class={`day-card-holiday${holiday.isDayOff ? ' is-off' : ''}`}>{holiday.name}</span>}
                    </span>
                    <span class="day-card-status">
                      <StatusPill status={status} isDefault={day.source !== 'entry'} />
                      {day.source === 'entry' && day.note && <span class="day-card-note">{day.note}</span>}
                    </span>
                    <span class="day-card-edit" aria-hidden="true">שינוי</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <DaySheet target={target} onChange={setTarget} />
      <RangeSheet open={rangeOpen} member={member} statuses={boot.statuses} defaultFrom={ws} onClose={() => setRangeOpen(false)} />
    </section>
  );
}
