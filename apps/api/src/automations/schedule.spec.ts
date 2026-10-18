import {
  ScheduleSpec, dateForIndex, firstIndexOnOrAfter, monthlyEquivalent, occurrenceDate, occurrencesBetween,
} from './schedule.js';

const spec = (o: Partial<ScheduleSpec> & { startDate: string }): ScheduleSpec => ({ frequency: 'MONTHLY', ...o });
const dates = (s: ScheduleSpec, n: number) => Array.from({ length: n }, (_, i) => occurrenceDate(s, i));

describe('schedule', () => {
  it('monthly on the 31st clamps to short months without drifting', () => {
    expect(dates(spec({ startDate: '2025-01-31' }), 6)).toEqual([
      '2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30', '2025-05-31', '2025-06-30',
    ]);
  });

  it('handles leap years (29 Feb) and returns to the 29th afterwards', () => {
    expect(dates(spec({ startDate: '2024-01-29' }), 3)).toEqual(['2024-01-29', '2024-02-29', '2024-03-29']);
    expect(dates(spec({ startDate: '2025-01-30' }), 3)).toEqual(['2025-01-30', '2025-02-28', '2025-03-30']);
  });

  it('yearly schedule on 29 Feb falls back to 28 Feb in non-leap years', () => {
    const s = spec({ frequency: 'YEARLY', startDate: '2024-02-29' });
    expect(dates(s, 3)).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
    // ...and recovers on the next leap year because dates are anchored, not chained
    expect(occurrenceDate(s, 4)).toBe('2028-02-29');
  });

  it('supports every two months, quarterly and half-yearly', () => {
    expect(dates(spec({ frequency: 'BIMONTHLY', startDate: '2025-01-15' }), 3)).toEqual(['2025-01-15', '2025-03-15', '2025-05-15']);
    expect(dates(spec({ frequency: 'QUARTERLY', startDate: '2025-11-30' }), 3)).toEqual(['2025-11-30', '2026-02-28', '2026-05-30']);
    expect(dates(spec({ frequency: 'HALF_YEARLY', startDate: '2025-03-01' }), 3)).toEqual(['2025-03-01', '2025-09-01', '2026-03-01']);
  });

  it('dayOfMonth overrides the start date day and never fires before the start date', () => {
    // start 20 Jan, anchor day 5 -> first run is 5 Feb
    expect(dates(spec({ startDate: '2025-01-20', dayOfMonth: 5 }), 3)).toEqual(['2025-02-05', '2025-03-05', '2025-04-05']);
    // start 1 Jan, anchor day 31 -> 31 Jan, 28 Feb
    expect(dates(spec({ startDate: '2025-01-01', dayOfMonth: 31 }), 2)).toEqual(['2025-01-31', '2025-02-28']);
  });

  it('daily, weekly and custom intervals', () => {
    expect(dates({ frequency: 'DAILY', startDate: '2024-02-27' }, 4)).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01']);
    expect(dates({ frequency: 'WEEKLY', startDate: '2025-12-29' }, 3)).toEqual(['2025-12-29', '2026-01-05', '2026-01-12']);
    expect(dates({ frequency: 'CUSTOM', customEvery: 10, customUnit: 'DAY', startDate: '2025-01-01' }, 3)).toEqual(['2025-01-01', '2025-01-11', '2025-01-21']);
    expect(dates({ frequency: 'CUSTOM', customEvery: 2, customUnit: 'WEEK', startDate: '2025-01-01' }, 2)).toEqual(['2025-01-01', '2025-01-15']);
    expect(dates({ frequency: 'CUSTOM', customEvery: 5, customUnit: 'MONTH', startDate: '2025-01-31' }, 3)).toEqual(['2025-01-31', '2025-06-30', '2025-11-30']);
  });

  it('rejects an invalid custom interval', () => {
    expect(() => occurrenceDate({ frequency: 'CUSTOM', startDate: '2025-01-01' }, 0)).toThrow();
  });

  it('firstIndexOnOrAfter finds the first due occurrence', () => {
    const s = spec({ startDate: '2025-01-31' });
    expect(firstIndexOnOrAfter(s, '2024-12-01')).toBe(0);
    expect(firstIndexOnOrAfter(s, '2025-02-28')).toBe(1);
    expect(firstIndexOnOrAfter(s, '2025-03-01')).toBe(2);
    expect(firstIndexOnOrAfter(s, '2030-06-15')).toBe(65); // Jun 2030 is 65 months after Jan 2025... 31 Jan -> index 65 = 30 Jun 2030
    expect(occurrenceDate(s, 65)).toBe('2030-06-30');
    const d = { frequency: 'DAILY' as const, startDate: '2025-01-01' };
    expect(firstIndexOnOrAfter(d, '2025-03-01')).toBe(59);
  });

  it('stops at the end date', () => {
    const s = spec({ startDate: '2025-01-31' });
    expect(dateForIndex(s, 2, '2025-03-30')).toBeNull();
    expect(dateForIndex(s, 2, '2025-03-31')).toBe('2025-03-31');
    expect(occurrencesBetween(s, 0, '2025-12-31', '2025-04-30').map((o) => o.date)).toEqual([
      '2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30',
    ]);
  });

  it('monthlyEquivalent normalises schedules to a monthly integer amount', () => {
    expect(monthlyEquivalent({ frequency: 'MONTHLY' }, 100000)).toBe(100000);
    expect(monthlyEquivalent({ frequency: 'QUARTERLY' }, 300000)).toBe(100000);
    expect(monthlyEquivalent({ frequency: 'YEARLY' }, 1200000)).toBe(100000);
    expect(monthlyEquivalent({ frequency: 'WEEKLY' }, 7000)).toBe(Math.round((7000 * 365) / 7 / 12));
  });
});
