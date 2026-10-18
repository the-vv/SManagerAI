import { describe, expect, it } from 'vitest';
import { dateKey, lastDayOfMonth, shiftMonth, zonedToUtc } from './datetime';
import { formatMoney, minorToDecimal, parseMoney } from './money';

describe('money', () => {
  it('parses user input to integer minor units without float math', () => {
    expect(parseMoney('1,250.5')).toBe(125050);
    expect(parseMoney('₹ 0.07')).toBe(7);
    expect(parseMoney('19.99')).toBe(1999);
    expect(parseMoney('1234')).toBe(123400);
    expect(parseMoney('-5')).toBe(-500);
  });
  it('rejects invalid input', () => {
    for (const bad of ['', 'abc', '1.234', '1..2', '--5', '1e3']) expect(parseMoney(bad)).toBeNull();
  });
  it('round-trips minor units', () => {
    for (const v of [0, 1, 99, 100, 123456789, -250]) expect(parseMoney(minorToDecimal(v))).toBe(v);
  });
  it('formats with locale grouping', () => {
    expect(formatMoney(12345600, { locale: 'en-IN', currency: 'INR' })).toBe('₹1,23,456.00');
    expect(formatMoney(5, { locale: 'en-US', currency: 'USD' })).toBe('$0.05');
  });
});

describe('datetime', () => {
  it('converts local wall time to UTC and back in the configured zone', () => {
    const d = zonedToUtc('2026-07-01', '00:30', 'Asia/Kolkata');
    expect(d.toISOString()).toBe('2026-06-30T19:00:00.000Z');
    expect(dateKey(d, 'Asia/Kolkata')).toBe('2026-07-01');
    expect(dateKey(d, 'UTC')).toBe('2026-06-30');
  });
  it('handles DST transitions', () => {
    expect(zonedToUtc('2026-03-08', '12:00', 'America/New_York').toISOString()).toBe('2026-03-08T16:00:00.000Z');
    expect(zonedToUtc('2026-01-08', '12:00', 'America/New_York').toISOString()).toBe('2026-01-08T17:00:00.000Z');
  });
  it('shifts months and finds month ends (leap years)', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
  });
});
