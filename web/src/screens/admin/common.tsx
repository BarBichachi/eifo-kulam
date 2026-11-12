import { api } from '../../data/api.ts';
import { store } from '../../data/store.ts';

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Moves the item at index by step and returns the new id order. */
export function moved<T extends { id: string }>(items: T[], index: number, step: -1 | 1): string[] {
  const ids = items.map((i) => i.id);
  const j = index + step;
  if (j < 0 || j >= ids.length) return ids;
  [ids[index], ids[j]] = [ids[j]!, ids[index]!];
  return ids;
}

/** Up/down buttons for list ordering. */
export function OrderButtons({ onMove, first, last, disabled }: { onMove: (step: -1 | 1) => void; first: boolean; last: boolean; disabled: boolean }) {
  return (
    <span class="order-btns">
      <button type="button" class="icon-btn is-small" disabled={disabled || first} onClick={() => onMove(-1)} aria-label="למעלה">▲</button>
      <button type="button" class="icon-btn is-small" disabled={disabled || last} onClick={() => onMove(1)} aria-label="למטה">▼</button>
    </span>
  );
}

/** Saves a new order for members or statuses in one request. */
export function saveOrder(kind: 'members' | 'statuses', ids: string[]) {
  return store.adminCall((token) => api('reorder', { kind, ids }, token));
}
