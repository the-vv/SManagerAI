/**
 * Timezone-aware date helpers built on Intl (no float/offset guessing).
 * Instants are ISO-8601 UTC strings from the API; "local" always means the user-configured IANA zone.
 */
const partsCache = new Map<string, Intl.DateTimeFormat>();

function dtf(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsCache.set(tz, f);
  }
  return f;
}

export interface Zoned { year: number; month: number; day: number; hour: number; minute: number; second: number; }

export function zonedParts(d: Date, tz: string): Zoned {
  const o: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(d)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return {
    year: o['year'], month: o['month'], day: o['day'],
    hour: o['hour'] === 24 ? 0 : o['hour'], minute: o['minute'], second: o['second'],
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function dateKey(d: Date | string, tz: string): string {
  const p = zonedParts(typeof d === 'string' ? new Date(d) : d, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}
export const monthKey = (d: Date | string, tz: string) => dateKey(d, tz).slice(0, 7);
export const todayKey = (tz: string) => dateKey(new Date(), tz);

export function timeKey(d: Date | string, tz: string): string {
  const p = zonedParts(typeof d === 'string' ? new Date(d) : d, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Local wall-clock date + time in `tz` -> UTC instant. Handles DST by re-checking the offset. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offsetAt = (ms: number) => {
    const p = zonedParts(new Date(ms), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
  };
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return new Date(guess);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DATE_FORMATS = ['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'] as const;

export function formatDateParts(p: { year: number; month: number; day: number }, pattern: string): string {
  return pattern
    .replace('yyyy', pad(p.year, 4))
    .replace('MMM', MONTHS[p.month - 1])
    .replace('MM', pad(p.month))
    .replace('dd', pad(p.day));
}

export function formatDate(d: Date | string, tz: string, pattern: string): string {
  return formatDateParts(zonedParts(typeof d === 'string' ? new Date(d) : d, tz), pattern);
}

export function formatTime(d: Date | string, tz: string, mode: '12h' | '24h'): string {
  const p = zonedParts(typeof d === 'string' ? new Date(d) : d, tz);
  if (mode === '24h') return `${pad(p.hour)}:${pad(p.minute)}`;
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** 'YYYY-MM-DD' (already local) -> formatted without any timezone conversion. */
export function formatDateKey(key: string, pattern: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return formatDateParts({ year, month, day }, pattern);
}

export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return short ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : `${names[m - 1]} ${y}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

export function relativeDayLabel(key: string, today: string): string | null {
  const d = (k: string) => Date.parse(`${k}T00:00:00Z`);
  const diff = Math.round((d(key) - d(today)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= 14) return `In ${diff} days`;
  return null;
}
