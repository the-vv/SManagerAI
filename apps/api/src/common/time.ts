import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

/**
 * Timezone policy: instants are stored in UTC. Calendar concepts ("this month", "the 5th")
 * are evaluated in the user's configured IANA timezone, converted to UTC instants at the
 * boundaries. Ranges are half-open: [from, to).
 */
export const DEFAULT_TZ = 'Asia/Kolkata';
export const AUTOMATION_HOUR = 9; // local time at which scheduled transactions are recorded

export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

export function isDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s, { zone: 'utc' }).isValid;
}

export function isMonthString(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function assertDate(s: string, field = 'date'): string {
  if (!isDateString(s)) throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date`);
  return s;
}

export function assertMonth(s: string, field = 'month'): string {
  if (!isMonthString(s)) throw new BadRequestException(`${field} must be YYYY-MM`);
  return s;
}

/** UTC instant of 00:00 local on 'YYYY-MM-DD'. */
export function startOfLocalDay(date: string, tz: string): Date {
  return DateTime.fromISO(date, { zone: tz }).startOf('day').toUTC().toJSDate();
}

/** UTC instant of 00:00 local on the day AFTER 'YYYY-MM-DD' (exclusive end of that day). */
export function endOfLocalDayExclusive(date: string, tz: string): Date {
  return DateTime.fromISO(date, { zone: tz }).plus({ days: 1 }).startOf('day').toUTC().toJSDate();
}

/** UTC instant for a fixed local wall-clock hour on a local date (used for automations). */
export function instantAtLocalHour(date: string, tz: string, hour = AUTOMATION_HOUR): Date {
  return DateTime.fromISO(date, { zone: tz }).set({ hour, minute: 0, second: 0, millisecond: 0 })
    .toUTC().toJSDate();
}

export function localDateOf(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: tz }).toFormat('yyyy-MM-dd');
}

export function localMonthOf(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: tz }).toFormat('yyyy-MM');
}

export function todayLocal(tz: string, now: Date = new Date()): string {
  return localDateOf(now, tz);
}

export function currentMonth(tz: string, now: Date = new Date()): string {
  return localMonthOf(now, tz);
}

export interface Range {
  from: Date; // inclusive
  to: Date; // exclusive
}

export function monthRange(month: string, tz: string): Range {
  const start = DateTime.fromFormat(month, 'yyyy-MM', { zone: tz }).startOf('month');
  return { from: start.toUTC().toJSDate(), to: start.plus({ months: 1 }).toUTC().toJSDate() };
}

/** Inclusive local date range 'YYYY-MM-DD'..'YYYY-MM-DD' to a half-open instant range. */
export function dateRange(fromDate: string, toDate: string, tz: string): Range {
  return { from: startOfLocalDay(fromDate, tz), to: endOfLocalDayExclusive(toDate, tz) };
}

export function shiftMonth(month: string, delta: number): string {
  return DateTime.fromFormat(month, 'yyyy-MM', { zone: 'utc' }).plus({ months: delta }).toFormat('yyyy-MM');
}

/** Months from `fromMonth` to `toMonth` inclusive. */
export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let cur = fromMonth;
  while (cur <= toMonth && out.length < 600) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return out;
}

export function addDaysToDate(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toFormat('yyyy-MM-dd');
}
