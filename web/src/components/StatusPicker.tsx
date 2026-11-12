import type { Status } from '../../../shared/types.ts';

interface Props {
  statuses: Status[];
  selectedId: string | null;
  /** The selection is the member-type default, not an explicit choice. */
  selectedIsDefault?: boolean;
  onPick: (status: Status) => void;
}

/** Grid of status chips. Retired statuses are hidden unless currently selected. */
export function StatusPicker({ statuses, selectedId, selectedIsDefault, onPick }: Props) {
  const visible = statuses.filter((s) => s.active || s.id === selectedId);
  return (
    <div class="status-grid" role="radiogroup" aria-label="איפה אהיה">
      {visible.map((s) => {
        const selected = s.id === selectedId;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected}
            class={`status-chip tone-${s.color}${selected ? ' is-selected' : ''}${selected && selectedIsDefault ? ' is-default' : ''}`}
            onClick={() => onPick(s)}
          >
            <span class="status-chip-emoji" aria-hidden="true">{s.emoji}</span>
            <span class="status-chip-label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
