import { describe, expect, it } from 'vitest';
import { parseHebcal } from '../../shared/holidays.ts';
import { reminderDecision, reminderPayload } from '../../shared/reminder.ts';
import { reminderText, weekSummaryText, whatsappShareUrl } from '../../shared/share.ts';
import { indexEntries, indexHolidays } from '../../shared/week.ts';
import { entry, holiday, member, statusMap } from '../fixtures.ts';

describe('parseHebcal', () => {
  it('keeps days off, erev chag, chol hamoed and selected national days', () => {
    const items = [
      { date: '2027-04-21', hebrew: 'ערב פסח', category: 'holiday', subcat: 'major' },
      { date: '2027-04-22', hebrew: 'פסח א׳', category: 'holiday', subcat: 'major', yomtov: true },
      { date: '2027-04-23', hebrew: 'פסח ב׳ (חוה״מ)', category: 'holiday', subcat: 'major' },
      { date: '2027-05-12', hebrew: 'יום העצמאות', category: 'holiday', subcat: 'modern' },
      { date: '2027-05-11', hebrew: 'יום הזכרון', category: 'holiday', subcat: 'modern' },
      { date: '2027-05-17', hebrew: 'יום הרצל', category: 'holiday', subcat: 'modern' },
      { date: '2027-03-22', hebrew: 'ערב פורים', category: 'holiday', subcat: 'major' },
      { date: '2027-12-24', hebrew: 'חנוכה: א׳ נר', category: 'holiday', subcat: 'major' },
      { date: '2027-04-22', hebrew: 'x', category: 'candles' },
      { date: 'bad', hebrew: 'פסח', category: 'holiday', yomtov: true },
    ];
    expect(parseHebcal(items)).toEqual([
      { date: '2027-04-21', name: 'ערב פסח', isDayOff: false },
      { date: '2027-04-22', name: 'פסח א׳', isDayOff: true },
      { date: '2027-04-23', name: 'פסח ב׳ (חוה״מ)', isDayOff: false },
      { date: '2027-05-12', name: 'יום העצמאות', isDayOff: true },
      { date: '2027-05-11', name: 'יום הזכרון', isDayOff: false },
    ]);
  });
});

describe('reminderDecision', () => {
  it('winter (UTC+2): 04:05Z run skips, 05:05Z run waits until 07:30', () => {
    expect(reminderDecision(new Date('2026-11-18T04:05:00Z')).action).toBe('skip');
    expect(reminderDecision(new Date('2026-11-18T05:05:00Z'))).toEqual({ action: 'wait', waitMs: 25 * 60_000 });
  });

  it('summer (UTC+3): 04:05Z run waits, 05:05Z run is a late fallback', () => {
    expect(reminderDecision(new Date('2027-06-02T04:05:30Z'))).toEqual({ action: 'wait', waitMs: 25 * 60_000 - 30_000 });
    expect(reminderDecision(new Date('2027-06-02T05:05:00Z')).action).toBe('send');
  });

  it('skips other days and afternoons', () => {
    expect(reminderDecision(new Date('2026-11-17T05:30:00Z')).action).toBe('skip');
    expect(reminderDecision(new Date('2026-11-18T10:30:00Z')).action).toBe('skip');
  });

  it('targets next week and deep-links to the editor', () => {
    const p = reminderPayload(new Date('2026-11-18T05:30:00Z'), 'https://x.github.io/eifo-kulam/');
    expect(p.week).toBe('2026-11-22');
    expect(p.url).toBe('https://x.github.io/eifo-kulam/#/me/2026-11-22');
    expect(p.body).toContain('22.11 - 26.11');
  });
});

describe('share texts', () => {
  const members = [member('a', { name: 'דנה' }), member('b', { name: 'יוסי', type: 'student' }), member('c', { name: 'רון' })];
  const entries = indexEntries([entry('2026-11-15', 'a', 'vacation'), entry('2026-11-16', 'c', 'other', 'קורס')]);

  it('summarizes a week with headcount and exceptions only', () => {
    const text = weekSummaryText('2026-11-15', members, statusMap(), entries, indexHolidays([holiday('2026-11-19', 'חג', true)]), 'URL');
    expect(text).toContain('*א׳ 15.11* | במשרד: 1');
    expect(text).toContain('🌴 דנה: חופש');
    expect(text).toContain('✏️ רון: אחר - קורס');
    expect(text).toContain('*ה׳ 19.11* (חג) | במשרד: 0');
    expect(text).not.toContain('יוסי');
    expect(text.endsWith('לעדכון: URL')).toBe(true);
  });

  it('builds a reminder and a wa.me link', () => {
    expect(reminderText('2026-11-22', [members[0]!], 'URL')).toBe('⏰ תזכורת: לעדכן איפה תהיו בשבוע 22.11 - 26.11\nעוד לא עדכנו: דנה\nURL');
    expect(whatsappShareUrl('a b')).toBe('https://wa.me/?text=a%20b');
  });
});
