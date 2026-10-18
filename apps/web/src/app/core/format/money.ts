/**
 * Money is always integer minor units (paise). Formatting and parsing are done on strings -
 * never by multiplying/dividing floating point numbers.
 */

/** 123456 -> "1234.56" (exact). */
export function minorToDecimal(minor: number): string {
  const neg = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

/** "1,234.5" / "₹ 1234" -> 123450, or null when invalid. Accepts at most 2 decimals. */
export function parseMoney(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = input.replace(/[\s,₹$€£]/g, '').replace(/^\+/, '');
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const minor = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(minor)) return null;
  return m[1] ? -minor : minor;
}

const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, currency: string, fraction: boolean): Intl.NumberFormat {
  const key = `${locale}|${currency}|${fraction}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency', currency,
      minimumFractionDigits: fraction ? 2 : 0, maximumFractionDigits: fraction ? 2 : 0,
    });
    cache.set(key, f);
  }
  return f;
}

export interface MoneyFormat { locale: string; currency: string; }

/** Formats minor units via the decimal *string*, so Intl does the grouping without float math. */
export function formatMoney(minor: number, fmt: MoneyFormat, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const decimal = minorToDecimal(minor);
  let out: string;
  if (opts.compact && Math.abs(minor) >= 100_000_00) {
    out = new Intl.NumberFormat(fmt.locale, {
      style: 'currency', currency: fmt.currency, notation: 'compact', maximumFractionDigits: 1,
    }).format(Number(decimal));
  } else {
    // Intl.NumberFormat.format accepts decimal strings and keeps them exact
    out = nf(fmt.locale, fmt.currency, true).format(decimal as unknown as number);
  }
  if (opts.sign && minor > 0) return `+${out}`;
  return out;
}
