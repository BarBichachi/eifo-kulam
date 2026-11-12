import { useState } from 'preact/hooks';
import { HE_DAY_LETTERS, dayOfWeek, formatShort, isIsoDate, israelToday, weekStart, workDays } from '../../../shared/dates.ts';
import { dayCells, headcount, type DayCell } from '../../../shared/week.ts';
import { DaySheet, type DayTarget } from '../components/DaySheet.tsx';
import { ErrorBox, Loading } from '../components/Feedback.tsx';
import { WeekNav } from '../components/WeekNav.tsx';
import { useStatusMap, useStore, useWeek } from '../data/hooks.ts';
import { store } from '../data/store.ts';
import { navigate } from '../lib/router.ts';

/** Everyone x Sun-Thu grid with the daily office headcount. Tap a cell for details (or to edit yourself). */
export function Week({ param }: { param?: string }) {
  const ws = weekStart(isIsoDate(param) ? param : israelToday());
  const boot = useStore((s) => s.boot)!;
  const statusMap = useStatusMap();
  const { loaded, error, entries, holidays } = useWeek(ws);
  const [target, setTarget] = useState<DayTarget | null>(null);
  const today = israelToday();
  const days = workDays(ws);
  const columns = days.map((date) => dayCells(boot.members, date, entries, holidays, statusMap));

  // Me first, then the roster order
  const rows = (columns[0] ?? []).map((c, i) => ({ member: c.member, i }));
  rows.sort((a, b) => Number(b.member.id === boot.me.id) - Number(a.member.id === boot.me.id) || a.i - b.i);

  return (
    <section class="screen">
      <WeekNav ws={ws} onChange={(next) => navigate(`/week/${next}`)} />
      {error && !loaded && <ErrorBox message={error} onRetry={() => void store.loadWeek(ws, true)} />}
      {!loaded && !error && <Loading />}
      {loaded && (
        <div class="grid-wrap">
          <table class="week-grid">
            <thead>
              <tr>
                <th class="corner" scope="col" />
                {days.map((date) => {
                  const holiday = holidays.get(date);
                  return (
                    <th key={date} scope="col" class={`${date === today ? 'is-today' : ''}${holiday?.isDayOff ? ' is-holiday' : ''}`}>
                      <span class="col-day">{HE_DAY_LETTERS[dayOfWeek(date)]}</span>
                      <span class="col-date">{formatShort(date)}</span>
                      {holiday && <span class="col-holiday" title={holiday.name}>{holiday.name}</span>}
                    </th>
                  );
                })}
              </tr>
              <tr class="headcount-row">
                <th scope="row">במשרד</th>
                {columns.map((cells, i) => (
                  <td key={days[i]}>
                    <span class="headcount">{headcount(cells)}</span>
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ member, i }) => (
                <tr key={member.id} class={member.id === boot.me.id ? 'is-me' : ''}>
                  <th scope="row" class="name-cell">{member.name}</th>
                  {columns.map((cells, d) => (
                    <GridCell key={days[d]} cell={cells[i]!} onOpen={() => setTarget({ memberId: member.id, date: days[d]! })} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p class="muted legend">צבע חלש = לא עודכן (ברירת מחדל). נקודה = יש הערה. לחיצה על משבצת מציגה פרטים.</p>
      <DaySheet target={target} onChange={setTarget} />
    </section>
  );
}

function GridCell({ cell, onOpen }: { cell: DayCell; onOpen: () => void }) {
  const { status, day } = cell;
  const hasNote = day.source === 'entry' && !!day.note;
  return (
    <td class="grid-cell">
      <button
        type="button"
        class={`cell-btn tone-${status.color}${day.source !== 'entry' ? ' is-default' : ''}`}
        onClick={onOpen}
        aria-label={`${cell.member.name}: ${status.label}${hasNote ? `, ${day.note}` : ''}`}
      >
        <span class="cell-emoji" aria-hidden="true">{status.emoji}</span>
        <span class="cell-label">{status.label}</span>
        {hasNote && <span class="cell-note-dot" aria-hidden="true" />}
      </button>
    </td>
  );
}
