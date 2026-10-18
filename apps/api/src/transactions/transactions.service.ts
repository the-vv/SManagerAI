import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationsService } from '../automations/automations.service.js';
import { csvCell, toCsv } from '../common/csv.js';
import { big, minorToDecimalString, num } from '../common/money.js';
import { Page } from '../common/pagination.js';
import { dateRange, localDateOf } from '../common/time.js';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { LedgerService, Totals } from '../ledger/ledger.service.js';
import { TransactionWriter, assertSaneInstant } from '../ledger/transaction-writer.js';
import { SettingsService } from '../settings/settings.service.js';
import { CreateTransactionDto, ExportQuery, TransactionQuery, UpdateTransactionDto } from './dto.js';
import { buildTxWhere, TxFilter } from './filters.js';

const INCLUDE = {
  account: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, color: true, icon: true } },
  transfer: {
    select: {
      id: true, fromAccountId: true, toAccountId: true,
      fromAccount: { select: { name: true } }, toAccount: { select: { name: true } },
    },
  },
} satisfies Prisma.TransactionInclude;

type Row = Prisma.TransactionGetPayload<{ include: typeof INCLUDE }>;

export function txView(r: Row) {
  return {
    id: r.id, kind: r.kind, amount: num(r.amount), title: r.title, notes: r.notes,
    occurredAt: r.occurredAt, source: r.source, automationId: r.automationId,
    account: r.account, category: r.category,
    transfer: r.transfer
      ? {
          id: r.transfer.id, fromAccountId: r.transfer.fromAccountId, toAccountId: r.transfer.toAccountId,
          fromAccountName: r.transfer.fromAccount.name, toAccountName: r.transfer.toAccount.name,
        }
      : null,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}
export type TransactionView = ReturnType<typeof txView>;
export const TX_INCLUDE = INCLUDE;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly writer: TransactionWriter,
    private readonly settings: SettingsService,
    private readonly automations: AutomationsService,
  ) {}

  async list(ownerId: string, q: TransactionQuery) {
    const tz = await this.settings.timezone(ownerId);
    const filter: TxFilter = { ...q };
    if (q.accountId) await this.ledger.resolveScope(ownerId, q.accountId);
    const where = buildTxWhere(ownerId, filter, tz);
    const page = q.page ?? 1, pageSize = q.pageSize ?? 25;
    const dir = q.dir ?? 'desc';
    const orderBy: Prisma.TransactionOrderByWithRelationInput[] =
      q.sort === 'amount' ? [{ amount: dir }, { occurredAt: 'desc' }]
        : q.sort === 'title' ? [{ title: dir }, { occurredAt: 'desc' }]
          : [{ occurredAt: dir }, { createdAt: dir }];

    const [rows, total, summary] = await Promise.all([
      this.prisma.transaction.findMany({ where, include: INCLUDE, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.transaction.count({ where }),
      this.ledger.totals(where),
    ]);
    const dailyTotals = q.sort && q.sort !== 'date' ? {} : await this.dailyTotals(where, rows, tz);
    return {
      items: rows.map(txView), total, page, pageSize,
      summary: this.summaryView(summary), dailyTotals,
    } satisfies Page<TransactionView> & Record<string, unknown>;
  }

  private summaryView(t: Totals) {
    return { income: t.income, expense: t.expense, net: t.net, count: t.count };
  }

  /** Income/expense per local day for the days visible on the page (same filter, not just the page rows). */
  private async dailyTotals(where: Prisma.TransactionWhereInput, rows: Row[], tz: string) {
    if (rows.length === 0) return {};
    const times = rows.map((r) => r.occurredAt.getTime());
    const range = dateRange(
      localDateOf(new Date(Math.min(...times)), tz), localDateOf(new Date(Math.max(...times)), tz), tz,
    );
    const slice = await this.prisma.transaction.findMany({
      where: { AND: [where, { occurredAt: { gte: range.from, lt: range.to } }] },
      select: { occurredAt: true, kind: true, amount: true },
    });
    const out: Record<string, { income: number; expense: number }> = {};
    for (const t of slice) {
      if (t.kind !== 'INCOME' && t.kind !== 'EXPENSE') continue;
      const d = localDateOf(t.occurredAt, tz);
      const e = (out[d] ??= { income: 0, expense: 0 });
      if (t.kind === 'INCOME') e.income += num(t.amount); else e.expense += num(t.amount);
    }
    return out;
  }

  async get(ownerId: string, id: string) {
    const r = await this.prisma.transaction.findFirst({ where: { id, ownerId }, include: INCLUDE });
    if (!r) throw new NotFoundException('Transaction not found');
    return txView(r);
  }

  async create(ownerId: string, dto: CreateTransactionDto) {
    const settings = await this.settings.get(ownerId);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const accountId = dto.accountId ?? (await this.defaultAccountId(ownerId));
    const id = await this.prisma.$transaction(async (tx) => {
      const row = await this.writer.record(tx, ownerId, {
        accountId, categoryId: dto.categoryId, kind: dto.kind, amount: dto.amount,
        title: dto.title, notes: dto.notes, occurredAt,
      });
      if (dto.automation) {
        await this.automations.createFromTransaction(tx, ownerId, row, dto.automation, {
          timezone: settings.timezone, defaultMode: settings.defaultAutomationMode,
          reminderDaysBefore: settings.reminderDaysBefore,
        });
      }
      return row.id;
    });
    return this.get(ownerId, id);
  }

  private async defaultAccountId(ownerId: string): Promise<string> {
    const acc =
      (await this.prisma.account.findFirst({ where: { ownerId, isActive: true, isDefault: true } })) ??
      (await this.prisma.account.findFirst({ where: { ownerId, isActive: true }, orderBy: { createdAt: 'asc' } }));
    if (!acc) throw new BadRequestException('Create an account first');
    return acc.id;
  }

  async update(ownerId: string, id: string, dto: UpdateTransactionDto) {
    const existing = await this.prisma.transaction.findFirst({ where: { id, ownerId } });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.transferId) throw new BadRequestException('Edit transfers from the transfer screen');
    const kind = (dto.kind ?? existing.kind) as 'INCOME' | 'EXPENSE';
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : existing.occurredAt;
    assertSaneInstant(occurredAt);
    const accountId = dto.accountId ?? existing.accountId;
    let categoryId = dto.categoryId === undefined ? existing.categoryId : dto.categoryId;
    await this.prisma.$transaction(async (tx) => {
      // an inactive account may keep its old transactions edited, but cannot receive moved ones
      await this.writer.assertAccountUsable(tx, ownerId, accountId, occurredAt, {
        allowInactive: accountId === existing.accountId,
      });
      if (categoryId) {
        if (dto.categoryId === undefined && dto.kind && dto.kind !== existing.kind) categoryId = null;
        else await this.writer.assertCategory(tx, ownerId, categoryId, kind);
      }
      await tx.transaction.update({
        where: { id },
        data: {
          title: dto.title?.trim(), amount: dto.amount === undefined ? undefined : big(dto.amount), kind,
          notes: dto.notes === undefined ? undefined : dto.notes || null, occurredAt, accountId, categoryId,
        },
      });
    });
    return this.get(ownerId, id);
  }

  async remove(ownerId: string, id: string) {
    const existing = await this.prisma.transaction.findFirst({ where: { id, ownerId } });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.transferId) throw new BadRequestException('Delete transfers from the transfer screen');
    await this.prisma.transaction.delete({ where: { id } });
  }

  async exportCsv(ownerId: string, q: ExportQuery): Promise<string> {
    const tz = await this.settings.timezone(ownerId);
    if (q.accountId) await this.ledger.resolveScope(ownerId, q.accountId);
    const where = buildTxWhere(ownerId, q, tz);
    const rows = await this.prisma.transaction.findMany({
      where, include: INCLUDE, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 50_000,
    });
    const typeLabel = (r: Row) =>
      r.kind === 'INCOME' ? 'Income' : r.kind === 'EXPENSE' ? 'Expense'
        : r.kind === 'TRANSFER_IN' ? 'Transfer in' : 'Transfer out';
    return toCsv(
      ['Date', 'Time', 'Type', 'Title', 'Amount', 'Account', 'Category', 'Notes', 'Origin'],
      rows.map((r) => {
        const dt = DateTime.fromJSDate(r.occurredAt, { zone: tz });
        const signed = r.kind === 'INCOME' || r.kind === 'TRANSFER_IN' ? r.amount : -r.amount;
        return [
          dt.toFormat('yyyy-MM-dd'), dt.toFormat('HH:mm'), typeLabel(r), r.title,
          minorToDecimalString(signed), r.account.name, r.category?.name ?? '', r.notes ?? '',
          r.source === 'MANUAL' ? 'Manual' : r.source === 'AUTOMATION_AUTO' ? 'Automatic' : 'Confirmed reminder',
        ];
      }),
    );
  }
}

export { csvCell };
