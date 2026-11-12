import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors.ts';
import { effectiveDay, normalizeDays } from '../../shared/status.ts';
import { SEED_STATUSES } from '../../shared/statuses.ts';
import {
  copyWeekDays, dayCells, groupByCategory, headcount, indexEntries, indexHolidays, notFilled, rangeDays, wholeWeekDays,
} from '../../shared/week.ts';
import { entry, holiday, member, statusMap } from '../fixtures.ts';

const WS = '2026-11-15';

describe('effectiveDay', () => {
  const regular = member('r');
  const student = member('s', { type: 'student' });

  it('uses the type default for untouched days', () => {
    expect(effectiveDay(regular, undefined, undefined)).toEqual({ statusId: 'office', note: '', source: 'default' });
    expect(effectiveDay(student, undefined, undefined)).toEqual({ statusId: 'not_coming', note: '', source: 'default' });
  });

  it('prefers an explicit entry, even on a day-off holiday', () => {
    const e = entry(WS, 'r', 'field', 'Haifa');
    expect(effectiveDay(regular, e, holiday(WS, 'פסח א׳'))).toEqual({ statusId: 'field', note: 'Haifa', source: 'entry' });
  });

  it('shows the holiday for an untouched day-off, and ignores banner-only holidays', () => {
    expect(effectiveDay(regular, undefined, holiday(WS, 'פסח א׳')).source).toBe('holiday');
    expect(effectiveDay(regular, undefined, holiday(WS, 'ערב פסח', false)).source).toBe('default');
  });

  it('treats a cleared entry as untouched', () => {
    expect(effectiveDay(student, entry(WS, 's', ''), undefined).source).toBe('default');
  });
});

describe('normalizeDays', () => {
  const statuses = statusMap([{ ...SEED_STATUSES[0]!, id: 'old', label: 'ישן', active: false }]);
  const none = new Map();
  const run = (days: unknown, existing = none) => normalizeDays(days, statuses, existing);
  const fails = (days: unknown, existing = none) => expect(() => run(days, existing)).toThrow(AppError);

  it('accepts statuses with trimmed notes and resets', () => {
    expect(run([
      { date: '2026-11-15', statusId: 'home', note: '  until   noon ' },
      { date: '2026-11-16', statusId: null, note: '' },
    ])).toEqual([
      { date: '2026-11-15', statusId: 'home', note: 'until noon' },
      { date: '2026-11-16', statusId: null, note: '' },
    ]);
  });

  it('turns a note without a status into "other"', () => {
    expect(run([{ date: WS, statusId: null, note: 'first aid course' }])[0]).toEqual({ date: WS, statusId: 'other', note: 'first aid course' });
  });

  it('requires a note for "other"', () => fails([{ date: WS, statusId: 'other', note: ' ' }]));
  it('rejects weekends', () => fails([{ date: '2026-11-20', statusId: 'office', note: '' }]));
  it('rejects bad dates', () => fails([{ date: '2026-11-31', statusId: 'office', note: '' }]));
  it('rejects duplicates', () => fails([{ date: WS, statusId: 'office', note: '' }, { date: WS, statusId: 'home', note: '' }]));
  it('rejects unknown statuses', () => fails([{ date: WS, statusId: 'nope', note: '' }]));
  it('rejects long notes', () => fails([{ date: WS, statusId: 'home', note: 'x'.repeat(201) }]));
  it('rejects empty batches', () => fails([]));

  it('rejects a retired status unless the day already has it', () => {
    fails([{ date: WS, statusId: 'old', note: '' }]);
    const existing = indexEntries([entry(WS, 'r', 'old')]);
    expect(normalizeDays([{ date: WS, statusId: 'old', note: 'x' }], statuses, new Map([[WS, existing.get(`${WS}|r`)!]]))).toHaveLength(1);
  });
});

describe('week views', () => {
  const members = [
    member('a', { order: 2 }),
    member('b', { order: 1, type: 'student' }),
    member('c', { order: 3 }),
    member('gone', { active: false }),
  ];
  const statuses = statusMap();

  it('builds day cells in roster order, skipping inactive members', () => {
    const cells = dayCells(members, WS, indexEntries([entry(WS, 'c', 'vacation')]), new Map(), statuses);
    expect(cells.map((c) => [c.member.id, c.status.id])).toEqual([['b', 'not_coming'], ['a', 'office'], ['c', 'vacation']]);
    expect(headcount(cells)).toBe(1);
    expect(groupByCategory(cells).off.map((c) => c.member.id)).toEqual(['b', 'c']);
  });

  it('counts half days as office', () => {
    const cells = dayCells(members, WS, indexEntries([entry(WS, 'b', 'half')]), new Map(), statuses);
    expect(headcount(cells)).toBe(3);
  });

  it('lists who has not set any fillable day', () => {
    const entries = indexEntries([entry('2026-11-17', 'a', 'office'), entry('2026-11-16', 'b', '')]);
    expect(notFilled(members, WS, entries, new Map()).map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('nobody is missing when the whole week is a holiday', () => {
    const holidays = indexHolidays(['15', '16', '17', '18', '19'].map((d) => holiday(`2026-11-${d}`, 'חג')));
    expect(notFilled(members, WS, new Map(), holidays)).toEqual([]);
  });

  it('merges two holidays on the same date', () => {
    const idx = indexHolidays([holiday(WS, 'א', false), holiday(WS, 'ב', true)]);
    expect(idx.get(WS)).toEqual({ date: WS, name: 'א, ב', isDayOff: true });
  });

  it('copies last week by weekday, resetting unset days and skipping day-off holidays', () => {
    const entries = indexEntries([entry('2026-11-08', 'a', 'home', 'x'), entry('2026-11-10', 'a', 'sick')]);
    const holidays = indexHolidays([holiday('2026-11-17', 'חג')]);
    expect(copyWeekDays('a', '2026-11-08', WS, entries, holidays)).toEqual([
      { date: '2026-11-15', statusId: 'home', note: 'x' },
      { date: '2026-11-16', statusId: null, note: '' },
      { date: '2026-11-18', statusId: null, note: '' },
      { date: '2026-11-19', statusId: null, note: '' },
    ]);
  });

  it('fills a range on work days only, skipping day-off holidays', () => {
    const holidays = indexHolidays([holiday('2026-11-23', 'חג'), holiday('2026-11-24', 'ערב', false)]);
    expect(rangeDays('2026-11-19', '2026-11-24', holidays, 'vacation', '').map((d) => d.date))
      .toEqual(['2026-11-19', '2026-11-22', '2026-11-24']);
    expect(rangeDays('2026-11-24', '2026-11-19', holidays, 'vacation', '')).toEqual([]);
    expect(wholeWeekDays(WS, new Map(), 'office')).toHaveLength(5);
  });
});
