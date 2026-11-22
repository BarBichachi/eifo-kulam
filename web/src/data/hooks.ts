import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Status } from '../../../shared/types.ts';
import { indexEntries, indexHolidays } from '../../../shared/week.ts';
import { store, type State } from './store.ts';

/** Reads a slice of the store; re-renders only when that slice changes (by reference). */
export function useStore<T>(select: (s: State) => T): T {
  const [, rerender] = useState(0);
  const selectRef = useRef(select);
  selectRef.current = select;
  const value = select(store.state);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(
    () =>
      store.subscribe(() => {
        const next = selectRef.current(store.state);
        if (!Object.is(next, valueRef.current)) rerender((n) => n + 1);
      }),
    [],
  );
  return value;
}

/** Loads one week (none for null), keeps it refreshed while on screen, and returns its indexes. */
export function useWeek(ws: string | null) {
  const week = useStore((s) => (ws ? s.weeks[ws] : undefined));
  const error = useStore((s) => (ws ? s.weekErrors[ws] : undefined));
  useEffect(() => {
    if (!ws) return;
    const unwatch = store.watch(ws);
    void store.loadWeek(ws);
    return unwatch;
  }, [ws]);
  const entries = useMemo(() => indexEntries(week?.entries ?? []), [week]);
  const holidays = useMemo(() => indexHolidays(week?.holidays ?? []), [week]);
  return { loaded: !!week, error, entries, holidays };
}

export function useStatusMap(): Map<string, Status> {
  const statuses = useStore((s) => s.boot?.statuses);
  return useMemo(() => new Map((statuses ?? []).map((st) => [st.id, st])), [statuses]);
}
