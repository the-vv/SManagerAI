import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { big, num } from '../common/money.js';
import { PrismaService, Tx } from '../database/prisma.service.js';
import { TransactionWriter, assertSaneInstant } from '../ledger/transaction-writer.js';
import { CreateTransferDto, UpdateTransferDto } from '../transactions/dto.js';

/**
 * A transfer = one Transfer row + two linked Transaction legs (TRANSFER_OUT on the source,
 * TRANSFER_IN on the destination), written/updated/deleted atomically. Legs are never income
 * or expense. Paying a credit card is simply a transfer from a bank account to the card.
 */
@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService, private readonly writer: TransactionWriter) {}

  private view(t: {
    id: string; fromAccountId: string; toAccountId: string; amount: bigint; occurredAt: Date;
    note: string | null; createdAt: Date; updatedAt: Date;
  }) {
    return {
      id: t.id, fromAccountId: t.fromAccountId, toAccountId: t.toAccountId, amount: num(t.amount),
      occurredAt: t.occurredAt, note: t.note, createdAt: t.createdAt, updatedAt: t.updatedAt,
    };
  }

  private async writeLegs(
    db: Tx, ownerId: string, transferId: string,
    p: { fromId: string; toId: string; amount: number; at: Date; note: string | null },
  ) {
    if (p.fromId === p.toId) throw new BadRequestException('Source and destination accounts must differ');
    assertSaneInstant(p.at);
    const [from, to] = await Promise.all([
      this.writer.assertAccountUsable(db, ownerId, p.fromId, p.at),
      this.writer.assertAccountUsable(db, ownerId, p.toId, p.at),
    ]);
    const common = { ownerId, transferId, amount: big(p.amount), occurredAt: p.at, notes: p.note };
    await db.transaction.deleteMany({ where: { transferId } });
    await db.transaction.createMany({
      data: [
        { ...common, accountId: p.fromId, kind: 'TRANSFER_OUT', title: `Transfer to ${to.name}` },
        { ...common, accountId: p.toId, kind: 'TRANSFER_IN', title: `Transfer from ${from.name}` },
      ],
    });
  }

  async create(ownerId: string, dto: CreateTransferDto) {
    const at = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    return this.prisma.$transaction(async (db) => {
      const t = await db.transfer.create({
        data: {
          ownerId, fromAccountId: dto.fromAccountId, toAccountId: dto.toAccountId,
          amount: big(dto.amount), occurredAt: at, note: dto.note || null,
        },
      });
      await this.writeLegs(db, ownerId, t.id, {
        fromId: dto.fromAccountId, toId: dto.toAccountId, amount: dto.amount, at, note: dto.note || null,
      });
      return this.view(t);
    });
  }

  async get(ownerId: string, id: string) {
    const t = await this.prisma.transfer.findFirst({ where: { id, ownerId } });
    if (!t) throw new NotFoundException('Transfer not found');
    return this.view(t);
  }

  async update(ownerId: string, id: string, dto: UpdateTransferDto) {
    const existing = await this.prisma.transfer.findFirst({ where: { id, ownerId } });
    if (!existing) throw new NotFoundException('Transfer not found');
    const next = {
      fromId: dto.fromAccountId ?? existing.fromAccountId,
      toId: dto.toAccountId ?? existing.toAccountId,
      amount: dto.amount ?? num(existing.amount),
      at: dto.occurredAt ? new Date(dto.occurredAt) : existing.occurredAt,
      note: dto.note === undefined ? existing.note : dto.note || null,
    };
    return this.prisma.$transaction(async (db) => {
      const t = await db.transfer.update({
        where: { id },
        data: {
          fromAccountId: next.fromId, toAccountId: next.toId, amount: big(next.amount),
          occurredAt: next.at, note: next.note,
        },
      });
      await this.writeLegs(db, ownerId, id, next);
      return this.view(t);
    });
  }

  async remove(ownerId: string, id: string) {
    const res = await this.prisma.transfer.deleteMany({ where: { id, ownerId } }); // legs cascade
    if (res.count === 0) throw new NotFoundException('Transfer not found');
  }
}
