import type { Status } from '../../../shared/types.ts';

interface Props {
  status: Status;
  /** Untouched day showing the member-type default. */
  isDefault?: boolean;
  compact?: boolean;
}

/** Colored status label: emoji + text, tinted by the status palette color. */
export function StatusPill({ status, isDefault, compact }: Props) {
  return (
    <span class={`pill tone-${status.color}${isDefault ? ' is-default' : ''}${compact ? ' is-compact' : ''}`}>
      <span class="pill-emoji" aria-hidden="true">{status.emoji}</span>
      <span class="pill-label">{status.label}</span>
    </span>
  );
}
