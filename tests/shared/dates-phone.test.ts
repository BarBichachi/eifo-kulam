import { describe, expect, it } from 'vitest';
import {
  addDays, dateRange, formatDayLong, formatDayShort, formatWeekRange, isIsoDate, isWorkDay, israelClock,
  nearestWorkDay, nextWeekStart, shiftWorkDay, weekStart, workDays,
} from '../../shared/dates.ts';
import { formatPhone, normalizePhone } from '../../shared/phone.ts';

describe('dates', () => {
  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-11-15')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-1-5')).toBe(false);
    expect(isIsoDate(20261115)).toBe(false);
  });

  it('computes Sunday-based weeks across month and year ends', () => {
    expect(weekStart('2026-11-19')).toBe('2026-11-15');
    expect(weekStart('2026-11-15')).toBe('2026-11-15');
    expect(weekStart('2026-11-21')).toBe('2026-11-15');
    expect(weekStart('2027-01-01')).toBe('2026-12-27');
    expect(workDays('2026-12-27')).toEqual(['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
  });

  it('treats Fri/Sat as weekend and skips them when moving', () => {
    expect(isWorkDay('2026-11-19')).toBe(true);
    expect(isWorkDay('2026-11-20')).toBe(false);
    expect(nearestWorkDay('2026-11-20')).toBe('2026-11-22');
    expect(shiftWorkDay('2026-11-19', 1)).toBe('2026-11-22');
    expect(shiftWorkDay('2026-11-22', -1)).toBe('2026-11-19');
  });

  it('next week from Friday is the coming Sunday', () => {
    expect(nextWeekStart('2026-11-20')).toBe('2026-11-22');
    expect(nextWeekStart('2026-11-15')).toBe('2026-11-22');
  });

  it('handles DST boundaries in date math', () => {
    expect(addDays('2027-03-25', 7)).toBe('2027-04-01');
    expect(dateRange('2026-10-23', '2026-10-27')).toHaveLength(5);
  });

  it('reads the Israel clock in winter and summer time', () => {
    expect(israelClock(new Date('2026-11-11T05:30:00Z'))).toEqual({ date: '2026-11-11', weekday: 3, minutes: 450 });
    expect(israelClock(new Date('2027-06-02T04:30:00Z'))).toEqual({ date: '2027-06-02', weekday: 3, minutes: 450 });
    expect(israelClock(new Date('2026-11-14T22:30:00Z')).date).toBe('2026-11-15');
  });

  it('formats Hebrew labels', () => {
    expect(formatDayShort('2026-11-15')).toBe('א׳ 15.11');
    expect(formatDayLong('2026-11-19')).toBe('יום חמישי, 19.11.2026');
    expect(formatWeekRange('2026-11-15')).toBe('15.11 - 19.11');
  });
});

describe('phone', () => {
  it.each([
    ['0541112233', '0541112233'],
    ['054-111-2233', '0541112233'],
    [' 054 111 2233 ', '0541112233'],
    ['+972 54-111-2233', '0541112233'],
    ['972541112233', '0541112233'],
    ['541112233', '0541112233'],
    [541112233, '0541112233'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '12345', '0312345678', '05411122331', null, undefined])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('formats for display', () => {
    expect(formatPhone('0541112233')).toBe('054-111-2233');
  });
});
