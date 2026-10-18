import { BadRequestException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AutomationsService, specOf } from '../automations/automations.service.js';
import { toCsv } from '../common/csv.js';
import { minorToDecimalString, num } from '../common/money.js';
import {
  Range, assertDate, currentMonth, dateRange, localDateOf, monthRange, monthsBetween, shiftMonth,
} from '../common/time.js';
import { PrismaService } from '../database/prisma.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { SettingsService } from '../settings/settings.service.js';

export interface CategoryRow {
  categoryId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: number;
  count: number;
  /** share of the total in basis points (10000 = 100%), integer math */
  shareBp: number;
}

export interface ReportQuery {
  from?: string;
  to?: string;
  accountId?: string;
}

const intersect = (a: Range, b: Range): Range => ({
  from: a.from > b.from ? a.from : b.from,
  to: a.to < b.to ? a.to : b.to,
});

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly automations: AutomationsService,
  ) {}

  /** Category totals with names/colours resolved. Used by both the dashboard and reports. */
  async categoryBreakdown(
    ownerId: string, range: Range, kind: 'INCOME' | 'EXPENSE', accountIds?: string[],
  ): Promise<{ total: number; items: CategoryRow[] }> {
    const totals = await this.ledger.categoryTotals(ownerId, range, kind, accountIds);
    const cats = await this.prisma.category.findMany({
      where: { ownerId, id: { in: totals.map((t) => t.categoryId).filter((x): x is string => !!x) } },
    });
    const byId = new Map(cats.map((c) => [c.id, c]));
    const grand = totals.reduce((s, t) => s + t.total, 0);
    const items = totals.map((t) => {
      const c = t.categoryId ? byId.get(t.categoryId) : undefined;
      return {
        categoryId: t.categoryId, name: c?.name ?? 'Uncategorized', color: c?.color ?? null, icon: c?.icon ?? null,
        total: t.total, count: t.count,
        shareBp: grand > 0 ? Number((BigInt(t.total) * 10000n + BigInt(Math.floor(grand / 2))) / BigInt(grand)) : 0,
      };
    });
    return { total: grand, items };
  }

  /** Resolves the report window; defaults to the last 6 calendar months including this one. */
  private async window(ownerId: string, q: ReportQuery) {
    const tz = await this.settings.timezone(ownerId);
    const thisMonth = currentMonth(tz);
    const fromDate = q.from ? assertDate(q.from, 'from') : `${shiftMonth(thisMonth, -5)}-01`;
    const toDate = q.to
      ? assertDate(q.to, 'to')
      : DateTime.fromFormat(thisMonth, 'yyyy-MM', { zone: 'utc' }).endOf('month').toFormat('yyyy-MM-dd');
    if (fromDate > toDate) throw new BadRequestException('"from" must not be after "to"');
    const months = monthsBetween(fromDate.slice(0, 7), toDate.slice(0, 7));
    if (months.length > 60) throw new BadRequestException('Report range is limited to 60 months');
    return { tz, fromDate, toDate, range: dateRange(fromDate, toDate, tz), months };
  }

  async overview(ownerId: string, q: ReportQuery) {
    const { tz, fromDate, toDate, range, months } = await this.window(ownerId, q);
    const scope = await this.ledger.resolveScope(ownerId, q.accountId);

    const monthly = [] as Array<{ month: string; income: number; expense: number; net: number; closingBalance: number }>;
    for (const m of months) {
      const r = intersect(monthRange(m, tz), range);
      const t = await this.ledger.periodTotals(ownerId, r, scope);
      monthly.push({
        month: m, income: t.income, expense: t.expense, net: t.net,
        closingBalance: await this.ledger.sumBalanceBefore(ownerId, r.to, scope),
      });
    }

    const [summary, expenseByCategory, incomeByCategory, accounts, largestExpenses, momCategories, recurring] =
      await Promise.all([
        this.ledger.reconcile(ownerId, range, scope),
        this.categoryBreakdown(ownerId, range, 'EXPENSE', scope),
        this.categoryBreakdown(ownerId, range, 'INCOME', scope),
        this.accountBreakdown(ownerId, range, scope),
        this.largestExpenses(ownerId, range, scope, tz),
        this.monthOverMonth(ownerId, toDate.slice(0, 7), tz, scope),
        this.recurringSummary(ownerId, q.accountId),
      ]);

    return {
      from: fromDate, to: toDate, accountId: q.accountId ?? null, timezone: tz,
      summary, monthly, expenseByCategory, incomeByCategory, accounts, largestExpenses,
      monthOverMonth: momCategories, recurring,
    };
  }

  private async accountBreakdown(ownerId: string, range: Range, scope?: string[]) {
    const [accounts, groups, openings, closings] = await Promise.all([
      this.prisma.account.findMany({
        where: { ownerId, ...(scope ? { id: { in: scope } } : {}) }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.transaction.groupBy({
        by: ['accountId', 'kind'],
        where: this.ledger.periodWhere(ownerId, range, scope),
        _sum: { amount: true },
      }),
      this.ledger.balancesBefore(ownerId, range.from, scope),
      this.ledger.balancesBefore(ownerId, range.to, scope),
    ]);
    return accounts.map((a) => {
      let income = 0, expense = 0;
      for (const g of groups) {
        if (g.accountId !== a.id) continue;
        if (g.kind === 'INCOME') income = num(g._sum.amount);
        if (g.kind === 'EXPENSE') expense = num(g._sum.amount);
      }
      return {
        id: a.id, name: a.name, type: a.type, isActive: a.isActive, color: a.color,
        income, expense, net: income - expense,
        openingBalance: num(openings.get(a.id) ?? 0n), closingBalance: num(closings.get(a.id) ?? 0n),
      };
    });
  }

  private async largestExpenses(ownerId: string, range: Range, scope: string[] | undefined, tz: string) {
    const rows = await this.prisma.transaction.findMany({
      where: { ...this.ledger.periodWhere(ownerId, range, scope), kind: 'EXPENSE' },
      orderBy: [{ amount: 'desc' }, { occurredAt: 'desc' }], take: 10,
      include: { account: { select: { name: true } }, category: { select: { name: true, color: true } } },
    });
    return rows.map((r) => ({
      id: r.id, title: r.title, amount: num(r.amount), date: localDateOf(r.occurredAt, tz),
      accountName: r.account.name, categoryName: r.category?.name ?? null, categoryColor: r.category?.color ?? null,
    }));
  }

  /** Spending of `month` vs the month before it, per category. */
  async monthOverMonth(ownerId: string, month: string, tz: string, scope?: string[]) {
    const prev = shiftMonth(month, -1);
    const [cur, old] = await Promise.all([
      this.categoryBreakdown(ownerId, monthRange(month, tz), 'EXPENSE', scope),
      this.categoryBreakdown(ownerId, monthRange(prev, tz), 'EXPENSE', scope),
    ]);
    const keys = new Map<string, { name: string; color: string | null; current: number; previous: number }>();
    for (const i of cur.items) keys.set(i.categoryId ?? '_', { name: i.name, color: i.color, current: i.total, previous: 0 });
    for (const i of old.items) {
      const k = i.categoryId ?? '_';
      const e = keys.get(k) ?? { name: i.name, color: i.color, current: 0, previous: 0 };
      e.previous = i.total;
      keys.set(k, e);
    }
    const categories = [...keys.values()]
      .map((c) => ({ ...c, delta: c.current - c.previous }))
      .sort((a, b) => b.current - a.current);
    return {
      month, previousMonth: prev, totalCurrent: cur.total, totalPrevious: old.total,
      totalDelta: cur.total - old.total, categories,
    };
  }

  async recurringSummary(ownerId: string, accountId?: string) {
    const autos = await this.prisma.automation.findMany({
      where: { ownerId, isEnabled: true, ...(accountId ? { accountId } : {}) },
      include: { account: { select: { name: true } }, category: { select: { name: true, color: true } } },
      orderBy: { title: 'asc' },
    });
    const items = autos.map((a) => {
      const v = this.automations.view(a);
      return {
        id: a.id, title: a.title, kind: a.kind, amount: v.amount, frequency: a.frequency, mode: a.mode,
        nextRunDate: a.nextRunDate, accountName: a.account.name, categoryName: a.category?.name ?? null,
        monthlyEquivalent: v.monthlyEquivalent,
      };
    });
    return {
      items,
      monthlyExpenses: items.filter((i) => i.kind === 'EXPENSE').reduce((s, i) => s + i.monthlyEquivalent, 0),
      monthlyIncome: items.filter((i) => i.kind === 'INCOME').reduce((s, i) => s + i.monthlyEquivalent, 0),
    };
  }

  async exportCsv(ownerId: string, q: ReportQuery, section: string): Promise<string> {
    const r = await this.overview(ownerId, q);
    const d = (n: number) => minorToDecimalString(n);
    switch (section) {
      case 'monthly':
        return toCsv(['Month', 'Income', 'Expenses', 'Net savings', 'Closing balance'],
          r.monthly.map((m) => [m.month, d(m.income), d(m.expense), d(m.net), d(m.closingBalance)]));
      case 'expense-categories':
        return toCsv(['Category', 'Total', 'Share %', 'Transactions'],
          r.expenseByCategory.items.map((c) => [c.name, d(c.total), (c.shareBp / 100).toFixed(2), c.count]));
      case 'income-categories':
        return toCsv(['Category', 'Total', 'Share %', 'Transactions'],
          r.incomeByCategory.items.map((c) => [c.name, d(c.total), (c.shareBp / 100).toFixed(2), c.count]));
      case 'accounts':
        return toCsv(['Account', 'Type', 'Opening balance', 'Income', 'Expenses', 'Closing balance'],
          r.accounts.map((a) => [a.name, a.type, d(a.openingBalance), d(a.income), d(a.expense), d(a.closingBalance)]));
      case 'recurring':
        return toCsv(['Title', 'Type', 'Amount', 'Frequency', 'Monthly equivalent', 'Next date', 'Account', 'Mode'],
          r.recurring.items.map((i) => [i.title, i.kind, d(i.amount), i.frequency, d(i.monthlyEquivalent), i.nextRunDate, i.accountName, i.mode]));
      case 'largest':
        return toCsv(['Date', 'Title', 'Amount', 'Account', 'Category'],
          r.largestExpenses.map((e) => [e.date, e.title, d(e.amount), e.accountName, e.categoryName]));
      default:
        throw new BadRequestException('Unknown export section');
    }
  }
}

export { specOf };
