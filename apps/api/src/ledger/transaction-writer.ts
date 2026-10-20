import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Tx } from '../database/prisma.service.js';
import { big } from '../common/money.js';
import type { TransactionKind, TransactionSource } from '../generated/prisma/enums.js';

export interface NewTransaction {
  accountId: string;
  categoryId?: string | null;
  eventId?: string | null;
  kind: 'INCOME' | 'EXPENSE';
  amount: number;
  title: string;
  notes?: string | null;
  occurredAt: Date;
  source?: TransactionSource;
  automationId?: string;
  occurrenceDate?: string;
  aiJobId?: string;
}

const MIN_DATE = new Date('1990-01-01T00:00:00Z');
const MAX_DATE = new Date('2100-01-01T00:00:00Z');

export function assertSaneInstant(d: Date): void {
  if (Number.isNaN(d.getTime()) || d < MIN_DATE || d > MAX_DATE) {
    throw new BadRequestException('Date is out of the supported range (1990-2100)');
  }
}

/** The one low-level place that inserts income/expense rows, shared by manual entry and automations. */
@Injectable()
export class TransactionWriter {
  async assertAccountUsable(db: Tx, ownerId: string, accountId: string, at: Date, opts: { allowInactive?: boolean } = {}) {
    const acc = await db.account.findFirst({ where: { id: accountId, ownerId } });
    if (!acc) throw new NotFoundException('Account not found');
    if (!acc.isActive && !opts.allowInactive) throw new ConflictException(`Account "${acc.name}" is inactive`);
    if (at < acc.openingDate) {
      throw new BadRequestException(`Date is before the opening date of account "${acc.name}"`);
    }
    return acc;
  }

  async assertCategory(db: Tx, ownerId: string, categoryId: string, kind: 'INCOME' | 'EXPENSE') {
    const c = await db.category.findFirst({ where: { id: categoryId, ownerId } });
    if (!c) throw new NotFoundException('Category not found');
    if (c.type !== kind) throw new ConflictException(`Category "${c.name}" is an ${c.type.toLowerCase()} category`);
  }

  async assertEvent(db: Tx, ownerId: string, eventId: string) {
    if (!(await db.event.findFirst({ where: { id: eventId, ownerId }, select: { id: true } }))) throw new NotFoundException('Event not found');
  }

  async record(db: Tx, ownerId: string, n: NewTransaction) {
    if (!Number.isSafeInteger(n.amount) || n.amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    assertSaneInstant(n.occurredAt);
    await this.assertAccountUsable(db, ownerId, n.accountId, n.occurredAt);
    if (n.categoryId) await this.assertCategory(db, ownerId, n.categoryId, n.kind);
    if (n.eventId) await this.assertEvent(db, ownerId, n.eventId);
    return db.transaction.create({
      data: {
        ownerId, accountId: n.accountId, categoryId: n.categoryId ?? null, eventId: n.eventId ?? null,
        kind: n.kind as TransactionKind, amount: big(n.amount), title: n.title.trim(),
        notes: n.notes || null, occurredAt: n.occurredAt, source: n.source ?? 'MANUAL',
        automationId: n.automationId ?? null, occurrenceDate: n.occurrenceDate ?? null, aiJobId: n.aiJobId ?? null,
      },
    });
  }
}
