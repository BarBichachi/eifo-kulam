import { addDays, formatWeekRange, israelToday, weekStart } from '../../../shared/dates.ts';
import { IconChevronLeft, IconChevronRight } from './Icons.tsx';

interface Props {
  ws: string;
  onChange: (ws: string) => void;
}

/** "השבוע" / "שבוע הבא" / "שבוע שעבר" relative to today, or empty. */
function relativeLabel(ws: string): string {
  const diff = Math.round((Date.parse(ws) - Date.parse(weekStart(israelToday()))) / (7 * 86_400_000));
  return diff === 0 ? 'השבוע' : diff === 1 ? 'שבוע הבא' : diff === -1 ? 'שבוע שעבר' : '';
}

/** Previous / next week arrows, the date range (tap to pick any date) and a jump back to this week. */
export function WeekNav({ ws, onChange }: Props) {
  const thisWeek = weekStart(israelToday());
  const relative = relativeLabel(ws);
  return (
    <div class="week-nav">
      <button type="button" class="icon-btn" onClick={() => onChange(addDays(ws, -7))} aria-label="שבוע קודם">
        <IconChevronRight />
      </button>
      <label class="week-nav-label">
        <span class="week-nav-range">{formatWeekRange(ws)}</span>
        <span class="week-nav-sub">{relative || ws.slice(0, 4)}</span>
        <input
          class="week-nav-date"
          type="date"
          value={ws}
          aria-label="קפיצה לתאריך"
          onChange={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (v) onChange(weekStart(v));
          }}
        />
      </label>
      <button type="button" class="icon-btn" onClick={() => onChange(addDays(ws, 7))} aria-label="שבוע הבא">
        <IconChevronLeft />
      </button>
      {ws !== thisWeek && (
        <button type="button" class="chip-btn" onClick={() => onChange(thisWeek)}>
          להשבוע
        </button>
      )}
    </div>
  );
}
