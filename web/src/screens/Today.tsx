import { useState } from 'preact/hooks';
import { formatDayLong, isIsoDate, israelToday, nearestWorkDay, shiftWorkDay, weekStart } from '../../../shared/dates.ts';
import { CATEGORY_LABELS } from '../../../shared/statuses.ts';
import type { Category } from '../../../shared/types.ts';
import { dayCells, groupByCategory, type DayCell } from '../../../shared/week.ts';
import { DaySheet, type DayTarget } from '../components/DaySheet.tsx';
import { ErrorBox, Loading } from '../components/Feedback.tsx';
import { IconChevronLeft, IconChevronRight } from '../components/Icons.tsx';
import { StatusPill } from '../components/StatusPill.tsx';
import { useStatusMap, useStore, useWeek } from '../data/hooks.ts';
import { store } from '../data/store.ts';
import { navigate } from '../lib/router.ts';

const ORDER: Category[] = ['office', 'elsewhere', 'off'];

/** Who is where on one day (today by default), grouped by office / elsewhere / off. */
export function Today({ param }: { param?: string }) {
  const today = nearestWorkDay(israelToday());
  const date = isIsoDate(param) ? nearestWorkDay(param) : today;
  const boot = useStore((s) => s.boot)!;
  const statusMap = useStatusMap();
  const { loaded, error, entries, holidays } = useWeek(weekStart(date));
  const [target, setTarget] = useState<DayTarget | null>(null);

  const cells = dayCells(boot.members, date, entries, holidays, statusMap);
  const groups = groupByCategory(cells);
  const holiday = holidays.get(date);
  const go = (d: string) => navigate(d === today ? '/today' : `/today/${d}`);

  return (
    <section class="screen">
      <header class="day-nav">
        <button type="button" class="icon-btn" onClick={() => go(shiftWorkDay(date, -1))} aria-label="יום קודם">
          <IconChevronRight />
        </button>
        <div class="day-nav-label">
          <h1 class="screen-title">{date === today ? (date === israelToday() ? 'היום' : 'יום העבודה הבא') : formatDayLong(date).split(',')[0]}</h1>
          <span class="muted">{formatDayLong(date)}</span>
        </div>
        <button type="button" class="icon-btn" onClick={() => go(shiftWorkDay(date, 1))} aria-label="יום הבא">
          <IconChevronLeft />
        </button>
        {date !== today && <button type="button" class="chip-btn" onClick={() => go(today)}>להיום</button>}
      </header>

      {holiday && <p class={`banner ${holiday.isDayOff ? 'is-holiday' : 'is-info'}`}>🎉 {holiday.name}</p>}
      {error && !loaded && <ErrorBox message={error} onRetry={() => void store.loadWeek(weekStart(date), true)} />}
      {!loaded && !error && <Loading />}

      {loaded && (
        <>
          <div class="summary">
            {ORDER.map((c) => (
              <button
                key={c}
                type="button"
                class={`summary-item is-${c}`}
                onClick={() => document.getElementById(`group-${c}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                <strong>{groups[c].length}</strong>
                <span>{CATEGORY_LABELS[c]}</span>
              </button>
            ))}
          </div>
          {ORDER.map((c) => (
            <Group key={c} id={`group-${c}`} title={CATEGORY_LABELS[c]} cells={groups[c]} meId={boot.me.id} onOpen={(memberId) => setTarget({ memberId, date })} />
          ))}
        </>
      )}
      <DaySheet target={target} onChange={setTarget} />
    </section>
  );
}

function Group({ id, title, cells, meId, onOpen }: { id: string; title: string; cells: DayCell[]; meId: string; onOpen: (memberId: string) => void }) {
  if (!cells.length) return null;
  return (
    <section class="group" id={id}>
      <h2 class="group-title">
        {title} <span class="count">{cells.length}</span>
      </h2>
      <ul class="people">
        {cells.map(({ member, day, status }) => (
          <li key={member.id}>
            <button type="button" class={`person${member.id === meId ? ' is-me' : ''}`} onClick={() => onOpen(member.id)}>
              <span class="person-name">
                {member.name}
                {member.id === meId && <span class="me-tag">אני</span>}
              </span>
              <span class="person-status">
                <StatusPill status={status} isDefault={day.source !== 'entry'} compact />
                {day.note && day.source === 'entry' && <span class="person-note">{day.note}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
