import { formatDayLong, shiftWorkDay, weekStart } from '../../../shared/dates.ts';
import { effectiveDay, resolveStatus, sortStatuses } from '../../../shared/status.ts';
import { entryKey } from '../../../shared/week.ts';
import { useStatusMap, useStore, useWeek } from '../data/hooks.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { DayEditor } from './DayEditor.tsx';
import { IconChevronLeft, IconChevronRight } from './Icons.tsx';
import { StatusPill } from './StatusPill.tsx';

export interface DayTarget {
  memberId: string;
  date: string;
}

interface Props {
  target: DayTarget | null;
  onChange: (target: DayTarget | null) => void;
}

/** "11.11 בשעה 10:15" in Israel time (avoids locale strings that bidi-scramble in RTL). */
function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}.${get('month')} בשעה ${get('hour')}:${get('minute')}`;
}

/** One person-day in a sheet: editor for yourself (or admins), read-only details for everyone else. */
export function DaySheet({ target, onChange }: Props) {
  const boot = useStore((s) => s.boot);
  const statusMap = useStatusMap();
  const ws = weekStart(target?.date ?? '2000-01-02');
  const { entries, holidays } = useWeek(ws);
  const member = boot?.members.find((m) => m.id === target?.memberId);
  const me = boot?.me;
  const close = () => onChange(null);
  if (!target || !member || !me || !boot) return <BottomSheet open={false} title="" onClose={close}>{null}</BottomSheet>;

  const entry = entries.get(entryKey(target.date, member.id));
  const holiday = holidays.get(target.date);
  const canEdit = member.id === me.id || me.isAdmin;
  const day = effectiveDay(member, entry, holiday);
  const status = resolveStatus(statusMap, day.statusId);
  const updatedBy = entry ? boot.members.find((m) => m.id === entry.updatedBy)?.name : undefined;
  const go = (step: 1 | -1) => onChange({ memberId: member.id, date: shiftWorkDay(target.date, step) });

  return (
    <BottomSheet
      open
      onClose={close}
      title={
        <>
          <span class="sheet-title-main">{member.id === me.id ? 'אני' : member.name}</span>
          <span class="sheet-title-sub">{formatDayLong(target.date)}</span>
        </>
      }
      footer={
        <div class="sheet-nav">
          <button type="button" class="btn is-ghost" onClick={() => go(-1)}>
            <IconChevronRight /> יום קודם
          </button>
          <button type="button" class="btn is-primary" onClick={close}>סיום</button>
          <button type="button" class="btn is-ghost" onClick={() => go(1)}>
            יום הבא <IconChevronLeft />
          </button>
        </div>
      }
    >
      {holiday && <p class={`banner ${holiday.isDayOff ? 'is-holiday' : 'is-info'}`}>{holiday.name}</p>}
      {canEdit ? (
        <DayEditor
          key={`${member.id}|${target.date}`}
          member={member}
          date={target.date}
          entry={entry}
          holiday={holiday}
          statuses={sortStatuses(boot.statuses)}
          statusMap={statusMap}
        />
      ) : (
        <div class="day-details">
          <StatusPill status={status} isDefault={day.source !== 'entry'} />
          {day.note && day.source === 'entry' && <p class="day-note">{day.note}</p>}
          <p class="muted">
            {day.source === 'entry'
              ? `עודכן ${formatUpdated(entry!.updatedAt)}${updatedBy && updatedBy !== member.name ? ` ע״י ${updatedBy}` : ''}`
              : 'לא עודכן: זו ברירת המחדל'}
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
