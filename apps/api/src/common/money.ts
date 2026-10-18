/**
 * Money is stored and calculated as integer minor units (paise). The DB uses BigInt; the API
 * contract uses plain JSON integers (safe up to 9e15 minor units = 9e13 major units).
 */
export const MAX_AMOUNT_MINOR = 9_000_000_000_000_000; // < Number.MAX_SAFE_INTEGER

export function num(v: bigint | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'bigint' ? Number(v) : v;
}

export function big(v: number): bigint {
  return BigInt(v);
}

/** Format minor units as a plain decimal string ("1234.50") for CSV exports. Exact. */
export function minorToDecimalString(minor: bigint | number): string {
  const v = typeof minor === 'bigint' ? minor : BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}
