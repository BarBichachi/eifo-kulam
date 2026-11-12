import { useEffect, useRef, useState } from 'preact/hooks';
import { NOTE_MAX } from '../../../shared/statuses.ts';
import { effectiveDay, isFilled } from '../../../shared/status.ts';
import type { Entry, Holiday, Member, Status } from '../../../shared/types.ts';
import { store } from '../data/store.ts';
import { StatusPicker } from './StatusPicker.tsx';

interface Props {
  member: Member;
  date: string;
  entry: Entry | undefined;
  holiday: Holiday | undefined;
  statuses: Status[];
  statusMap: Map<string, Status>;
}

const NOTE_DEBOUNCE_MS = 1200;

/**
 * Edits one person-day. Picking a status saves right away; the note saves on blur or after a pause.
 * Statuses that need a note ("אחר") wait for the note before saving.
 */
export function DayEditor({ member, date, entry, holiday, statuses, statusMap }: Props) {
  const day = effectiveDay(member, entry, holiday);
  const savedStatus = isFilled(entry) ? entry.statusId : null;
  const savedNote = isFilled(entry) ? entry.note : '';
  const [statusId, setStatusId] = useState<string | null>(savedStatus);
  const [note, setNote] = useState(savedNote);
  const [hint, setHint] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const statusRef = useRef<string | null>(savedStatus);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNote = useRef<(() => void) | null>(null);

  const chooseStatus = (id: string | null) => {
    statusRef.current = id;
    setStatusId(id);
  };

  // Follow server/optimistic updates unless the user is typing
  useEffect(() => {
    chooseStatus(savedStatus);
    if (document.activeElement !== noteRef.current) setNote(savedNote);
  }, [savedStatus, savedNote, date, member.id]);

  // Closing the sheet (or moving to another day) must not drop a note that is still debouncing
  useEffect(() => () => flushNote(), []);

  const flushNote = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const run = pendingNote.current;
    pendingNote.current = null;
    run?.();
  };

  const commit = (nextStatus: string | null, nextNote: string) => {
    const trimmed = nextNote.trim();
    // A note on an untouched day keeps the shown default ("במשרד" + note), unless it is a holiday
    const effectiveStatus = nextStatus ?? (trimmed && day.source === 'default' ? day.statusId : null);
    const status = effectiveStatus ? statusMap.get(effectiveStatus) : undefined;
    if (status?.requiresNote && !trimmed) {
      setHint(`כתבו הערה כדי לשמור "${status.label}"`);
      noteRef.current?.focus();
      return;
    }
    setHint('');
    if ((effectiveStatus ?? null) === savedStatus && trimmed === savedNote) return;
    store.queueDays(member.id, [{ date, statusId: effectiveStatus, note: trimmed }]);
  };

  // Handlers read the live status/note (refs), never a value captured by an older render
  const onPick = (s: Status) => {
    chooseStatus(s.id);
    commit(s.id, noteRef.current?.value ?? note);
  };

  const onNoteInput = (value: string) => {
    setNote(value);
    if (timer.current) clearTimeout(timer.current);
    pendingNote.current = () => commit(statusRef.current, value);
    timer.current = setTimeout(flushNote, NOTE_DEBOUNCE_MS);
  };

  const onNoteBlur = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pendingNote.current = null;
    commit(statusRef.current, noteRef.current?.value ?? note);
  };

  const reset = () => {
    chooseStatus(null);
    setNote('');
    setHint('');
    store.queueDays(member.id, [{ date, statusId: null, note: '' }]);
  };

  const selectedId = statusId ?? (day.source === 'default' ? day.statusId : null);
  const noteRequired = !!(selectedId && statusMap.get(selectedId)?.requiresNote);
  return (
    <div class="day-editor">
      {day.source === 'holiday' && !savedStatus && <p class="banner is-holiday">🎉 {holiday?.name}: יום חופש. אפשר לעדכן אם בכל זאת עובדים.</p>}
      <StatusPicker statuses={statuses} selectedId={selectedId} selectedIsDefault={!statusId} onPick={onPick} />
      <label class="field">
        <span class="field-label">{noteRequired ? 'הערה (חובה: מה התוכנית?)' : 'הערה (לא חובה)'}</span>
        <textarea
          ref={noteRef}
          class="input note-input"
          rows={2}
          maxLength={NOTE_MAX}
          placeholder="למשל: עד 13:00, אצל לקוח בחיפה, קורס עזרה ראשונה"
          value={note}
          onInput={(e) => onNoteInput((e.target as HTMLTextAreaElement).value)}
          onBlur={onNoteBlur}
        />
      </label>
      {hint && <p class="hint is-warning" role="alert">{hint}</p>}
      <div class="day-editor-foot">
        <span class="muted">{savedStatus ? '' : day.source === 'holiday' ? 'ברירת מחדל: חג' : 'לא עודכן: מוצגת ברירת המחדל'}</span>
        {(savedStatus || note) && (
          <button type="button" class="link-btn" onClick={reset}>
            איפוס לברירת מחדל
          </button>
        )}
      </div>
    </div>
  );
}
