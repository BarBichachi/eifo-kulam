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

/** Loads (and refreshes) one week and returns its indexes. */
export function useWeek(ws: string) {
  const week = useStore((s) => s.weeks[ws]);
  const error = useStore((s) => s.weekErrors[ws]);
  const tick = useStore((s) => s.resumeTick);
  useEffect(() => {
    void store.loadWeek(ws);
  }, [ws, tick]);
  const entries = useMemo(() => indexEntries(week?.entries ?? []), [week]);
  const holidays = useMemo(() => indexHolidays(week?.holidays ?? []), [week]);
  return { loaded: !!week, error, entries, holidays };
}

export function useStatusMap(): Map<string, Status> {
  const statuses = useStore((s) => s.boot?.statuses);
  return useMemo(() => new Map((statuses ?? []).map((st) => [st.id, st])), [statuses]);
}
