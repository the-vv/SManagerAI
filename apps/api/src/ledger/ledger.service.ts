import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { TransactionKind } from '../generated/prisma/enums.js';
import { num } from '../common/money.js';
import { Range, monthRange } from '../common/time.js';

export interface Totals {
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  /** income - expense. Transfers and adjustments are never part of this. */
  net: number;
  count: number;
}

export interface Reconciliation {
  opening: number;
  income: number;
  expense: number;
  /** Net money moved between accounts that left (or entered) the selected scope. 0 when scope is "all". */
  transfersNet: number;
  adjustments: number;
  closing: number;
  /** income - expense */
  netMovement: number;
}

export interface CategoryTotal {
  categoryId: string | null;
  total: number;
  count: number;
}

/**
 * THE single source of truth for financial arithmetic. Dashboard, transaction list, reports
 * and account pages all call these methods, so their totals cannot drift apart.
 *
 * Balance rule (per account):
 *   balance(before T) = openingBalance (if openingDate < T)
 *                     + Σ INCOME + Σ TRANSFER_IN   (occurredAt < T)
 *                     − Σ EXPENSE − Σ TRANSFER_OUT (occurredAt < T)
 *                     + Σ adjustments              (effectiveAt < T)
 * Nothing is cached, so a backdated insert/edit/delete is reflected immediately.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  static signed(kind: TransactionKind, amount: bigint): bigint {
    return kind === 'INCOME' || kind === 'TRANSFER_IN' ? amount : -amount;
  }

  /** Validates ownership. Returns undefined for "all accounts". */
  async resolveScope(ownerId: string, accountId?: string | null): Promise<string[] | undefined> {
    if (!accountId) return undefined;
    const acc = await this.prisma.account.findFirst({ where: { id: accountId, ownerId }, select: { id: true } });
    if (!acc) throw new NotFoundException('Account not found');
    return [acc.id];
  }

  /** Balance of every (selected) account counting every event strictly before `before`. */
  async balancesBefore(ownerId: string, before: Date, accountIds?: string[]): Promise<Map<string, bigint>> {
    const accWhere: Prisma.AccountWhereInput = { ownerId, ...(accountIds ? { id: { in: accountIds } } : {}) };
    const [accounts, txs, adjs] = await Promise.all([
      this.prisma.account.findMany({ where: accWhere, select: { id: true, openingBalance: true, openingDate: true } }),
      this.prisma.transaction.groupBy({
        by: ['accountId', 'kind'],
        where: { ownerId, occurredAt: { lt: before }, ...(accountIds ? { accountId: { in: accountIds } } : {}) },
        _sum: { amount: true },
      }),
      this.prisma.balanceAdjustment.groupBy({
        by: ['accountId'],
        where: { ownerId, effectiveAt: { lt: before }, ...(accountIds ? { accountId: { in: accountIds } } : {}) },
        _sum: { amount: true },
      }),
    ]);
    const out = new Map<string, bigint>();
    for (const a of accounts) out.set(a.id, a.openingDate < before ? a.openingBalance : 0n);
    for (const t of txs) {
      if (!out.has(t.accountId)) continue;
      out.set(t.accountId, out.get(t.accountId)! + LedgerService.signed(t.kind, t._sum.amount ?? 0n));
    }
    for (const a of adjs) {
      if (!out.has(a.accountId)) continue;
      out.set(a.accountId, out.get(a.accountId)! + (a._sum.amount ?? 0n));
    }
    return out;
  }

  async sumBalanceBefore(ownerId: string, before: Date, accountIds?: string[]): Promise<number> {
    let sum = 0n;
    for (const v of (await this.balancesBefore(ownerId, before, accountIds)).values()) sum += v;
    return num(sum);
  }

  /** Income/expense/transfer totals for any transaction filter. */
  async totals(where: Prisma.TransactionWhereInput): Promise<Totals> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['kind'], where, _sum: { amount: true }, _count: { _all: true },
    });
    const t: Totals = { income: 0, expense: 0, transferIn: 0, transferOut: 0, net: 0, count: 0 };
    for (const r of rows) {
      const v = num(r._sum.amount);
      t.count += r._count._all;
      if (r.kind === 'INCOME') t.income = v;
      else if (r.kind === 'EXPENSE') t.expense = v;
      else if (r.kind === 'TRANSFER_IN') t.transferIn = v;
      else t.transferOut = v;
    }
    t.net = t.income - t.expense;
    return t;
  }

  periodTotals(ownerId: string, range: Range, accountIds?: string[]): Promise<Totals> {
    return this.totals(this.periodWhere(ownerId, range, accountIds));
  }

  periodWhere(ownerId: string, range: Range, accountIds?: string[]): Prisma.TransactionWhereInput {
    return {
      ownerId,
      occurredAt: { gte: range.from, lt: range.to },
      ...(accountIds ? { accountId: { in: accountIds } } : {}),
    };
  }

  async reconcile(ownerId: string, range: Range, accountIds?: string[]): Promise<Reconciliation> {
    const [opening, closing, totals, adj, openedAccounts] = await Promise.all([
      this.sumBalanceBefore(ownerId, range.from, accountIds),
      this.sumBalanceBefore(ownerId, range.to, accountIds),
      this.periodTotals(ownerId, range, accountIds),
      this.prisma.balanceAdjustment.aggregate({
        where: {
          ownerId, effectiveAt: { gte: range.from, lt: range.to },
          ...(accountIds ? { accountId: { in: accountIds } } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.account.aggregate({
        where: {
          ownerId, openingDate: { gte: range.from, lt: range.to },
          ...(accountIds ? { id: { in: accountIds } } : {}),
        },
        _sum: { openingBalance: true },
      }),
    ]);
    return {
      // an account that starts inside the period contributes its opening balance to the period's opening
      opening: opening + num(openedAccounts._sum.openingBalance),
      closing,
      income: totals.income, expense: totals.expense,
      transfersNet: totals.transferIn - totals.transferOut,
      adjustments: num(adj._sum.amount),
      netMovement: totals.net,
    };
  }

  async categoryTotals(
    ownerId: string, range: Range, kind: 'INCOME' | 'EXPENSE', accountIds?: string[],
  ): Promise<CategoryTotal[]> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { ...this.periodWhere(ownerId, range, accountIds), kind },
      _sum: { amount: true }, _count: { _all: true },
    });
    return rows
      .map((r) => ({ categoryId: r.categoryId, total: num(r._sum.amount), count: r._count._all }))
      .sort((a, b) => b.total - a.total);
  }

  /** One DB aggregate per month; month boundaries are evaluated in the user's timezone. */
  async monthlyTotals(ownerId: string, months: string[], tz: string, accountIds?: string[]) {
    const out: Array<{ month: string } & Totals> = [];
    for (const month of months) {
      out.push({ month, ...(await this.periodTotals(ownerId, monthRange(month, tz), accountIds)) });
    }
    return out;
  }

  /** Closing balance at the end of each month (carry-forward is implicit: it is derived). */
  async monthlyClosingBalances(ownerId: string, months: string[], tz: string, accountIds?: string[]) {
    const out: Array<{ month: string; closing: number }> = [];
    for (const month of months) {
      out.push({ month, closing: await this.sumBalanceBefore(ownerId, monthRange(month, tz).to, accountIds) });
    }
    return out;
  }
}
