import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { assertDate, assertMonth, dateRange, monthRange, Range } from '../common/time.js';

export interface TxFilter {
  month?: string;
  from?: string;
  to?: string;
  accountId?: string;
  kind?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  categoryId?: string;
  eventId?: string;
  origin?: 'MANUAL' | 'AUTOMATION';
  q?: string;
}

export function filterRange(f: TxFilter, tz: string): Range | undefined {
  if (f.month) return monthRange(assertMonth(f.month), tz);
  if (f.from || f.to) {
    const from = f.from ? assertDate(f.from, 'from') : '1970-01-01';
    const to = f.to ? assertDate(f.to, 'to') : '2999-12-31';
    if (from > to) throw new BadRequestException('"from" must not be after "to"');
    return dateRange(from, to, tz);
  }
  return undefined;
}

/**
 * ONE place that turns user-facing filters into a Prisma `where`. The transaction list, its
 * summary totals, CSV export and reports all use it, so they always agree.
 *
 * When no account is selected, the TRANSFER_IN leg is hidden so each transfer appears once
 * ("A → B"); transfers are excluded from income/expense totals regardless.
 */
export function buildTxWhere(ownerId: string, f: TxFilter, tz: string): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [];
  const range = filterRange(f, tz);
  if (range) and.push({ occurredAt: { gte: range.from, lt: range.to } });
  if (f.accountId) and.push({ accountId: f.accountId });
  else and.push({ kind: { not: 'TRANSFER_IN' } });
  if (f.kind === 'TRANSFER') and.push({ kind: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] } });
  else if (f.kind) and.push({ kind: f.kind });
  if (f.categoryId) and.push(f.categoryId === 'none' ? { categoryId: null } : { categoryId: f.categoryId });
  if (f.eventId) and.push({ eventId: f.eventId });
  if (f.origin === 'MANUAL') and.push({ source: 'MANUAL' });
  if (f.origin === 'AUTOMATION') and.push({ source: { in: ['AUTOMATION_AUTO', 'AUTOMATION_CONFIRMED'] } });
  if (f.q) and.push({ OR: [{ title: { contains: f.q } }, { notes: { contains: f.q } }] });
  return { ownerId, AND: and };
}
