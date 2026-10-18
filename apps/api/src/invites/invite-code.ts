import { createHash, randomBytes } from 'node:crypto';

// Crockford base32 (no I, L, O, U): easy to read out loud and to type by hand.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 16; // 80 bits of randomness

/** New random code, shown to humans as XXXX-XXXX-XXXX-XXXX. */
export function generateInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[bytes[i] % 32];
  return formatInviteCode(raw);
}

export function formatInviteCode(raw: string): string {
  return raw.match(/.{1,4}/g)!.join('-');
}

/**
 * Forgiving manual entry: case, dashes and spaces do not matter, and the usual look-alikes are
 * mapped (O->0, I/L->1). Returns null when the result cannot be a code.
 */
export function normalizeInviteCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return raw.length === CODE_LENGTH && [...raw].every((c) => ALPHABET.includes(c)) ? raw : null;
}

export const hashInviteCode = (normalized: string): string => createHash('sha256').update(normalized).digest('hex');
