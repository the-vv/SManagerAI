import { DateTime } from 'luxon';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM';
export type Unit = 'DAY' | 'WEEK' | 'MONTH';

export interface ScheduleSpec {
  frequency: Freq;
  customEvery?: number | null;
  customUnit?: Unit | null;
  /** 'YYYY-MM-DD' in the user's timezone - the first date on which the schedule may fire. */
  startDate: string;
  /** Anchor day for month-based schedules (1-31). Defaults to the start date's day. Clamped in short months. */
  dayOfMonth?: number | null;
}

/**
 * Schedules are pure functions of (spec, occurrence index). We never "add a month to the
 * previous date" (which would drift 31 Jan -> 28 Feb -> 28 Mar); every occurrence is computed
 * from the anchor, so a monthly-on-the-31st schedule yields 31 Jan, 28/29 Feb, 31 Mar, 30 Apr...
 */
export function resolveInterval(spec: Pick<ScheduleSpec, 'frequency' | 'customEvery' | 'customUnit'>): { unit: Unit; count: number } {
  switch (spec.frequency) {
    case 'DAILY': return { unit: 'DAY', count: 1 };
    case 'WEEKLY': return { unit: 'WEEK', count: 1 };
    case 'MONTHLY': return { unit: 'MONTH', count: 1 };
    case 'BIMONTHLY': return { unit: 'MONTH', count: 2 };
    case 'QUARTERLY': return { unit: 'MONTH', count: 3 };
    case 'HALF_YEARLY': return { unit: 'MONTH', count: 6 };
    case 'YEARLY': return { unit: 'MONTH', count: 12 };
    case 'CUSTOM': {
      const count = spec.customEvery ?? 0;
      if (!spec.customUnit || !Number.isInteger(count) || count < 1) {
        throw new Error('Custom frequency needs customEvery >= 1 and customUnit');
      }
      return { unit: spec.customUnit, count };
    }
  }
}

const iso = (d: DateTime) => d.toFormat('yyyy-MM-dd');

export function occurrenceDate(spec: ScheduleSpec, index: number): string {
  const { unit, count } = resolveInterval(spec);
  const start = DateTime.fromISO(spec.startDate, { zone: 'utc' });
  if (unit === 'DAY') return iso(start.plus({ days: index * count }));
  if (unit === 'WEEK') return iso(start.plus({ weeks: index * count }));

  const dom = spec.dayOfMonth ?? start.day;
  const at = (monthsFromStartMonth: number) => {
    const m = start.startOf('month').plus({ months: monthsFromStartMonth });
    return m.set({ day: Math.min(dom, m.daysInMonth!) });
  };
  // If the anchor day already passed in the start month, the first occurrence is next month.
  const offset = iso(at(0)) < spec.startDate ? 1 : 0;
  return iso(at(offset + index * count));
}

/** Smallest occurrence index whose date is >= `date`. */
export function firstIndexOnOrAfter(spec: ScheduleSpec, date: string): number {
  if (occurrenceDate(spec, 0) >= date) return 0;
  const { unit, count } = resolveInterval(spec);
  const unitDays = (unit === 'DAY' ? 1 : unit === 'WEEK' ? 7 : 30.4375) * count;
  const diffDays = DateTime.fromISO(date, { zone: 'utc' }).diff(DateTime.fromISO(spec.startDate, { zone: 'utc' }), 'days').days;
  let i = Math.max(0, Math.floor(diffDays / unitDays) - 2);
  while (i > 0 && occurrenceDate(spec, i - 1) >= date) i--;
  while (occurrenceDate(spec, i) < date) i++;
  return i;
}

/** Next scheduled date for a given index, or null when it falls after the end date. */
export function dateForIndex(spec: ScheduleSpec, index: number, endDate?: string | null): string | null {
  const d = occurrenceDate(spec, index);
  return endDate && d > endDate ? null : d;
}

/** Occurrences with date in [fromDate, toDate], starting at `startIndex`. */
export function occurrencesBetween(
  spec: ScheduleSpec, startIndex: number, toDate: string, endDate?: string | null, cap = 100,
): Array<{ index: number; date: string }> {
  const out: Array<{ index: number; date: string }> = [];
  for (let i = startIndex; out.length < cap; i++) {
    const d = dateForIndex(spec, i, endDate);
    if (d === null || d > toDate) break;
    out.push({ index: i, date: d });
  }
  return out;
}

/** Approximate monthly cost of a schedule in minor units (integer, half-up), for summaries only. */
export function monthlyEquivalent(spec: Pick<ScheduleSpec, 'frequency' | 'customEvery' | 'customUnit'>, amount: number): number {
  const { unit, count } = resolveInterval(spec);
  // per-year amount as a rational num/den, then divide by 12
  const [num, den] =
    unit === 'DAY' ? [BigInt(amount) * 365n, BigInt(count)]
      : unit === 'WEEK' ? [BigInt(amount) * 365n, BigInt(7 * count)]
        : [BigInt(amount) * 12n, BigInt(count)];
  const d = den * 12n;
  return Number((num * 2n + d) / (d * 2n));
}
