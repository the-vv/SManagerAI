import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { big, num } from '../common/money.js';
import { assertDate, endOfLocalDayExclusive, localDateOf, startOfLocalDay, todayLocal } from '../common/time.js';
import { CreateAccountDto, CreateAdjustmentDto, UpdateAccountDto } from './dto.js';
import { Account } from '../generated/prisma/client.js';

export function accountView(a: Account, balance: number, tz: string) {
  return {
    id: a.id, name: a.name, institution: a.institution, identifier: a.identifier, type: a.type,
    openingBalance: num(a.openingBalance), openingDate: localDateOf(a.openingDate, tz),
    isDefault: a.isDefault, isActive: a.isActive, color: a.color, icon: a.icon,
    balance, createdAt: a.createdAt,
  };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Accounts with their balance as of the end of `date` (default: now), plus combined totals.
   * available   = Σ balance of ACTIVE non-credit-card accounts (money you can actually spend)
   * creditDue   = amount owed on ACTIVE credit cards (never added to `available`)
   * netWorth    = available − creditDue
   */
  async overview(ownerId: string, opts: { date?: string; includeInactive?: boolean } = {}) {
    const tz = await this.settings.timezone(ownerId);
    let before: Date;
    if (opts.date) before = endOfLocalDayExclusive(assertDate(opts.date), tz);
    else before = new Date(Date.now() + 1);
    const accounts = await this.prisma.account.findMany({
      where: { ownerId, ...(opts.includeInactive === false ? { isActive: true } : {}) },
      orderBy: [{ isActive: 'desc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    const balances = await this.ledger.balancesBefore(ownerId, before);
    const items = accounts.map((a) => accountView(a, num(balances.get(a.id) ?? 0n), tz));
    let available = 0, creditCardBalance = 0;
    for (const a of items) {
      if (!a.isActive) continue;
      if (a.type === 'CREDIT_CARD') creditCardBalance += a.balance;
      else available += a.balance;
    }
    return {
      items,
      asOf: opts.date ?? null,
      totals: { available, creditDue: -creditCardBalance, netWorth: available + creditCardBalance },
    };
  }

  async get(ownerId: string, id: string) {
    const a = await this.requireOwned(ownerId, id);
    const tz = await this.settings.timezone(ownerId);
    const bal = await this.ledger.sumBalanceBefore(ownerId, new Date(Date.now() + 1), [id]);
    return accountView(a, bal, tz);
  }

  async requireOwned(ownerId: string, id: string): Promise<Account> {
    const a = await this.prisma.account.findFirst({ where: { id, ownerId } });
    if (!a) throw new NotFoundException('Account not found');
    return a;
  }

  async create(ownerId: string, dto: CreateAccountDto) {
    const tz = await this.settings.timezone(ownerId);
    const name = dto.name.trim();
    if (await this.prisma.account.findFirst({ where: { ownerId, name } })) {
      throw new ConflictException('An account with this name already exists');
    }
    const openingDate = startOfLocalDay(assertDate(dto.openingDate ?? todayLocal(tz)), tz);
    const created = await this.prisma.$transaction(async (tx) => {
      const hasDefault = (await tx.account.count({ where: { ownerId, isDefault: true, isActive: true } })) > 0;
      const makeDefault = dto.isDefault === true || !hasDefault;
      if (makeDefault) await tx.account.updateMany({ where: { ownerId, isDefault: true }, data: { isDefault: false } });
      return tx.account.create({
        data: {
          ownerId, name, institution: dto.institution || null, identifier: dto.identifier || null,
          type: dto.type, openingBalance: big(dto.openingBalance ?? 0), openingDate,
          isDefault: makeDefault, color: dto.color ?? null, icon: dto.icon ?? null,
        },
      });
    });
    return this.get(ownerId, created.id);
  }

  async update(ownerId: string, id: string, dto: UpdateAccountDto) {
    const existing = await this.requireOwned(ownerId, id);
    const tz = await this.settings.timezone(ownerId);
    if (dto.name && dto.name.trim() !== existing.name) {
      if (await this.prisma.account.findFirst({ where: { ownerId, name: dto.name.trim(), NOT: { id } } })) {
        throw new ConflictException('An account with this name already exists');
      }
    }
    let openingDate: Date | undefined;
    if (dto.openingDate) {
      openingDate = startOfLocalDay(assertDate(dto.openingDate), tz);
      if (openingDate > existing.openingDate) await this.assertNothingBefore(ownerId, id, openingDate);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id },
        data: {
          name: dto.name?.trim(), institution: dto.institution, identifier: dto.identifier,
          type: dto.type, openingBalance: dto.openingBalance === undefined ? undefined : big(dto.openingBalance),
          openingDate, isActive: dto.isActive, color: dto.color, icon: dto.icon,
        },
      });
      if (dto.isActive === false && existing.isDefault) {
        await tx.account.update({ where: { id }, data: { isDefault: false } });
        const next = await tx.account.findFirst({
          where: { ownerId, isActive: true, NOT: { id } }, orderBy: { createdAt: 'asc' },
        });
        if (next) await tx.account.update({ where: { id: next.id }, data: { isDefault: true } });
      }
      if (dto.isActive === true && !existing.isActive) {
        const hasDefault = (await tx.account.count({ where: { ownerId, isActive: true, isDefault: true } })) > 0;
        if (!hasDefault) await tx.account.update({ where: { id }, data: { isDefault: true } });
      }
    });
    return this.get(ownerId, id);
  }

  private async assertNothingBefore(ownerId: string, accountId: string, date: Date) {
    const [t, a] = await Promise.all([
      this.prisma.transaction.count({ where: { ownerId, accountId, occurredAt: { lt: date } } }),
      this.prisma.balanceAdjustment.count({ where: { ownerId, accountId, effectiveAt: { lt: date } } }),
    ]);
    if (t + a > 0) throw new BadRequestException('Existing transactions or adjustments are dated before the new opening date');
  }

  async setDefault(ownerId: string, id: string) {
    const acc = await this.requireOwned(ownerId, id);
    if (!acc.isActive) throw new BadRequestException('Inactive accounts cannot be the default');
    await this.prisma.$transaction([
      this.prisma.account.updateMany({ where: { ownerId, isDefault: true }, data: { isDefault: false } }),
      this.prisma.account.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return this.get(ownerId, id);
  }

  /** Hard delete is only possible for an account with no financial history. */
  async remove(ownerId: string, id: string) {
    const acc = await this.requireOwned(ownerId, id);
    const [t, a, au, tr] = await Promise.all([
      this.prisma.transaction.count({ where: { accountId: id } }),
      this.prisma.balanceAdjustment.count({ where: { accountId: id } }),
      this.prisma.automation.count({ where: { accountId: id } }),
      this.prisma.transfer.count({ where: { OR: [{ fromAccountId: id }, { toAccountId: id }] } }),
    ]);
    if (t + a + au + tr > 0) {
      throw new ConflictException('This account has history. Deactivate it instead of deleting it.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.account.delete({ where: { id } });
      if (acc.isDefault) {
        const next = await tx.account.findFirst({ where: { ownerId, isActive: true }, orderBy: { createdAt: 'asc' } });
        if (next) await tx.account.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  // ---------------------------------------------------------------- adjustments

  async listAdjustments(ownerId: string, accountId: string) {
    await this.requireOwned(ownerId, accountId);
    const rows = await this.prisma.balanceAdjustment.findMany({
      where: { ownerId, accountId }, orderBy: { effectiveAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id, accountId: r.accountId, amount: num(r.amount), effectiveAt: r.effectiveAt,
      reason: r.reason, createdAt: r.createdAt,
    }));
  }

  async createAdjustment(ownerId: string, accountId: string, dto: CreateAdjustmentDto) {
    const acc = await this.requireOwned(ownerId, accountId);
    const tz = await this.settings.timezone(ownerId);
    if ((dto.amount === undefined) === (dto.targetBalance === undefined)) {
      throw new BadRequestException('Provide exactly one of amount or targetBalance');
    }
    const now = new Date();
    let effectiveAt = now;
    if (dto.date) {
      const dayEnd = new Date(endOfLocalDayExclusive(assertDate(dto.date), tz).getTime() - 1);
      effectiveAt = dayEnd < now ? dayEnd : now;
    }
    if (effectiveAt < acc.openingDate) throw new BadRequestException('Adjustment date is before the account opening date');

    return this.prisma.$transaction(async (tx) => {
      let delta: bigint;
      if (dto.targetBalance !== undefined) {
        // balance right after `effectiveAt`, using the same rule as the ledger
        const bal = await this.balanceAtInclusive(tx, ownerId, accountId, effectiveAt, acc);
        delta = big(dto.targetBalance) - bal;
      } else {
        delta = big(dto.amount!);
      }
      if (delta === 0n) throw new BadRequestException('Adjustment would not change the balance');
      const row = await tx.balanceAdjustment.create({
        data: { ownerId, accountId, amount: delta, effectiveAt, reason: dto.reason.trim() },
      });
      return { id: row.id, accountId, amount: num(row.amount), effectiveAt: row.effectiveAt, reason: row.reason, createdAt: row.createdAt };
    });
  }

  private async balanceAtInclusive(
    tx: Pick<PrismaService, 'transaction' | 'balanceAdjustment'>,
    ownerId: string, accountId: string, at: Date, acc: Account,
  ): Promise<bigint> {
    const upTo = { lte: at };
    const [txs, adj] = await Promise.all([
      tx.transaction.groupBy({ by: ['kind'], where: { ownerId, accountId, occurredAt: upTo }, _sum: { amount: true } }),
      tx.balanceAdjustment.aggregate({ where: { ownerId, accountId, effectiveAt: upTo }, _sum: { amount: true } }),
    ]);
    let bal = acc.openingBalance + (adj._sum.amount ?? 0n);
    for (const t of txs) bal += LedgerService.signed(t.kind, t._sum.amount ?? 0n);
    return bal;
  }

  async removeAdjustment(ownerId: string, accountId: string, adjustmentId: string) {
    const res = await this.prisma.balanceAdjustment.deleteMany({ where: { id: adjustmentId, accountId, ownerId } });
    if (res.count === 0) throw new NotFoundException('Adjustment not found');
  }
}
