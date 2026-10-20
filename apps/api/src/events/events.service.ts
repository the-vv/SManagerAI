import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { big, MAX_AMOUNT_MINOR, num } from '../common/money.js';
import { PrismaService } from '../database/prisma.service.js';
import { Event } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateEventDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @Matches(DATE) startDate?: string;
  @IsOptional() @Matches(DATE) endDate?: string;
  /** Minor units. */
  @IsOptional() @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) budget?: number;
}

export class UpdateEventDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @Matches(DATE) startDate?: string | null;
  @IsOptional() @Matches(DATE) endDate?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) budget?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

const view = (e: Event) => ({
  id: e.id, name: e.name, notes: e.notes, startDate: e.startDate, endDate: e.endDate,
  budget: e.budget === null ? null : num(e.budget), isActive: e.isActive,
});

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  /** Every event with its own income / expense / count. */
  async list(ownerId: string) {
    const [events, sums] = await Promise.all([
      this.prisma.event.findMany({ where: { ownerId }, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.transaction.groupBy({
        by: ['eventId', 'kind'], where: { ownerId, eventId: { not: null } }, _sum: { amount: true }, _count: { _all: true },
      }),
    ]);
    return events.map((e) => {
      const mine = sums.filter((s) => s.eventId === e.id);
      const sum = (k: string) => num(mine.find((s) => s.kind === k)?._sum.amount ?? null);
      return { ...view(e), income: sum('INCOME'), expense: sum('EXPENSE'), count: mine.reduce((n, s) => n + s._count._all, 0) };
    });
  }

  /** One event: totals plus spending per category. The transactions come from the normal list (eventId filter). */
  async get(ownerId: string, id: string) {
    const e = await this.owned(ownerId, id);
    const where = { ownerId, eventId: id };
    const [totals, byCat, cats, days] = await Promise.all([
      this.ledger.totals(where),
      this.prisma.transaction.groupBy({ by: ['categoryId'], where: { ...where, kind: 'EXPENSE' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.category.findMany({ where: { ownerId }, select: { id: true, name: true, color: true } }),
      this.prisma.transaction.aggregate({ where, _min: { occurredAt: true }, _max: { occurredAt: true } }),
    ]);
    const catById = new Map(cats.map((c) => [c.id, c]));
    const categories = byCat
      .map((r) => ({
        categoryId: r.categoryId, name: (r.categoryId && catById.get(r.categoryId)?.name) || 'Uncategorized',
        color: (r.categoryId && catById.get(r.categoryId)?.color) || null, total: num(r._sum.amount), count: r._count._all,
      }))
      .sort((a, b) => b.total - a.total);
    return {
      ...view(e), income: totals.income, expense: totals.expense, net: totals.net, count: totals.count, categories,
      firstAt: days._min.occurredAt, lastAt: days._max.occurredAt,
    };
  }

  async create(ownerId: string, dto: CreateEventDto) {
    const name = dto.name.trim();
    await this.assertFree(ownerId, name);
    const e = await this.prisma.event.create({
      data: { ownerId, name, notes: dto.notes || null, startDate: dto.startDate ?? null, endDate: dto.endDate ?? null, budget: dto.budget ? big(dto.budget) : null },
    });
    return view(e);
  }

  async update(ownerId: string, id: string, dto: UpdateEventDto) {
    const existing = await this.owned(ownerId, id);
    if (dto.name && dto.name.trim() !== existing.name) await this.assertFree(ownerId, dto.name.trim(), id);
    const e = await this.prisma.event.update({
      where: { id },
      data: {
        name: dto.name?.trim(), notes: dto.notes === undefined ? undefined : dto.notes || null,
        startDate: dto.startDate, endDate: dto.endDate, isActive: dto.isActive,
        budget: dto.budget === undefined ? undefined : dto.budget === null ? null : big(dto.budget),
      },
    });
    return view(e);
  }

  /** Transactions are kept; they just lose the tag. */
  async remove(ownerId: string, id: string) {
    await this.owned(ownerId, id);
    await this.prisma.event.delete({ where: { id } });
  }

  private async owned(ownerId: string, id: string) {
    const e = await this.prisma.event.findFirst({ where: { id, ownerId } });
    if (!e) throw new NotFoundException('Event not found');
    return e;
  }

  private async assertFree(ownerId: string, name: string, exceptId?: string) {
    if (await this.prisma.event.findFirst({ where: { ownerId, name, ...(exceptId ? { NOT: { id: exceptId } } : {}) } })) {
      throw new ConflictException('An event with this name already exists');
    }
  }
}
