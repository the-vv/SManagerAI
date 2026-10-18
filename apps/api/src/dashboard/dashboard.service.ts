import { Injectable } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { AutomationsService } from '../automations/automations.service.js';
import { num } from '../common/money.js';
import { assertMonth, currentMonth, monthRange, monthsBetween, shiftMonth } from '../common/time.js';
import { PrismaService } from '../database/prisma.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TX_INCLUDE, txView } from '../transactions/transactions.service.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly reports: ReportsService,
    private readonly accounts: AccountsService,
    private readonly automations: AutomationsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Everything the dashboard shows, in one round trip. All arithmetic is delegated to
   * LedgerService / ReportsService - the same code the Transactions and Reports pages use.
   */
  async get(ownerId: string, q: { month?: string; accountId?: string }) {
    const tz = await this.settings.timezone(ownerId);
    const month = q.month ? assertMonth(q.month) : currentMonth(tz);
    const scope = await this.ledger.resolveScope(ownerId, q.accountId);
    const range = monthRange(month, tz);
    const prevRange = monthRange(shiftMonth(month, -1), tz);

    const [
      period, prev, expenseByCategory, incomeByCategory, trend, recent, upcoming, pending, overview,
    ] = await Promise.all([
      this.ledger.reconcile(ownerId, range, scope),
      this.ledger.periodTotals(ownerId, prevRange, scope),
      this.reports.categoryBreakdown(ownerId, range, 'EXPENSE', scope),
      this.reports.categoryBreakdown(ownerId, range, 'INCOME', scope),
      this.ledger.monthlyTotals(ownerId, monthsBetween(shiftMonth(month, -5), month), tz, scope),
      this.prisma.transaction.findMany({
        where: {
          ...this.ledger.periodWhere(ownerId, range, scope),
          ...(scope ? {} : { kind: { not: 'TRANSFER_IN' as const } }),
        },
        include: TX_INCLUDE, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 8,
      }),
      this.automations.upcoming(ownerId, { days: 30, accountId: q.accountId, limit: 6 }),
      this.prisma.automationExecution.count({ where: { ownerId, status: 'PENDING' } }),
      this.accounts.overview(ownerId, { includeInactive: false }),
    ]);

    // "Current balance" card: the selected account, otherwise the default account.
    const focus = overview.items.find((a) => (q.accountId ? a.id === q.accountId : a.isDefault)) ?? null;
    const selected = q.accountId ? await this.accounts.get(ownerId, q.accountId) : null;

    return {
      month, accountId: q.accountId ?? null, timezone: tz,
      summary: {
        income: period.income, expense: period.expense, net: period.netMovement,
        previous: { income: prev.income, expense: prev.expense, net: prev.net },
        delta: { income: period.income - prev.income, expense: period.expense - prev.expense, net: period.netMovement - prev.net },
      },
      // Opening + movement = closing. Explicitly NOT the same as "net movement" when there are
      // transfers, adjustments or account openings in the period.
      period,
      currentBalance: selected
        ? { accountId: selected.id, name: selected.name, type: selected.type, balance: selected.balance }
        : focus ? { accountId: focus.id, name: focus.name, type: focus.type, balance: focus.balance } : null,
      combined: overview.totals,
      accounts: overview.items.map((a) => ({ id: a.id, name: a.name, type: a.type, color: a.color, balance: a.balance })),
      expenseByCategory, incomeByCategory,
      trend: trend.map((t) => ({ month: t.month, income: t.income, expense: t.expense, net: t.net })),
      recentTransactions: recent.map(txView),
      upcoming,
      pendingReminders: pending,
    };
  }
}

export { num };
