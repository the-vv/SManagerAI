import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { big, MAX_AMOUNT_MINOR, num } from '../common/money.js';
import { PrismaService } from '../database/prisma.service.js';
import { Event } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { assertSaneInstant } from '../ledger/transaction-writer.js';

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

export class CreateExpenseDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) amount: number;
  /** An existing person... */
  @IsOptional() @IsString() personId?: string;
  /** ...or a new one, created (or matched by name) on the spot. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) personName?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) title?: string;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) amount?: number;
  @IsOptional() @IsString() personId?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string | null;
}

export class UpdateSharingDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() allowGuestExpenses?: boolean;
  /** true: invalidate the old link and make a new one */
  @IsOptional() @IsBoolean() regenerate?: boolean;
}

export class GuestExpenseDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) amount: number;
  @IsOptional() @IsISO8601() occurredAt?: string;
}

export class AddPersonDto {
  @IsOptional() @IsString() personId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) name?: string;
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
  shareEnabled: e.shareEnabled, allowGuestExpenses: e.allowGuestExpenses, shareToken: e.shareEnabled ? e.shareToken : null,
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
    const others = await this.prisma.eventExpense.groupBy({ by: ['eventId'], where: { ownerId }, _sum: { amount: true } });
    return events.map((e) => {
      const mine = sums.filter((s) => s.eventId === e.id);
      const sum = (k: string) => num(mine.find((s) => s.kind === k)?._sum.amount ?? null);
      return { ...view(e), income: sum('INCOME'), expense: sum('EXPENSE'), othersExpense: num(others.find((o) => o.eventId === e.id)?._sum.amount ?? null), count: mine.reduce((n, s) => n + s._count._all, 0) };
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
      ...(await this.sharing(ownerId, id, totals.expense)),
    };
  }

  /**
   * Equal split of everything spent on the event (the owner's tagged expenses + what others paid).
   * balance > 0: they paid more than their share (should get back); < 0: they owe.
   * Remainder paise are handed out one each so the shares add up exactly.
   */
  private async sharing(ownerId: string, eventId: string, myExpense: number) {
    const [links, expenses] = await Promise.all([
      this.prisma.eventPerson.findMany({ where: { eventId }, include: { person: true } }),
      this.prisma.eventExpense.findMany({ where: { eventId, ownerId }, include: { person: true }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }] }),
    ]);
    const spentBy = new Map<string, number>();
    for (const x of expenses) spentBy.set(x.personId, (spentBy.get(x.personId) ?? 0) + num(x.amount));
    const people = links.map((l) => l.person).sort((a, b) => a.name.localeCompare(b.name));
    const total = myExpense + [...spentBy.values()].reduce((a, b) => a + b, 0);
    const n = people.length + 1;
    const members = [{ personId: null as string | null, name: 'You', spent: myExpense }, ...people.map((p) => ({ personId: p.id as string | null, name: p.name, spent: spentBy.get(p.id) ?? 0 }))]
      .map((m, i) => {
        const share = Math.floor(total / n) + (i < total % n ? 1 : 0);
        return { ...m, share, balance: m.spent - share };
      });
    return {
      totalCost: total, othersExpense: total - myExpense, members,
      expenses: expenses.map((x) => ({
        id: x.id, title: x.title, amount: num(x.amount), notes: x.notes, occurredAt: x.occurredAt, addedByGuest: x.addedByGuest,
        person: { id: x.person.id, name: x.person.name },
      })),
    };
  }

  /** Finds the person by id or name (creating them), and makes sure they take part in the event. */
  private async resolvePerson(ownerId: string, eventId: string, ref: { personId?: string; name?: string }) {
    let person = ref.personId ? await this.prisma.person.findFirst({ where: { id: ref.personId, ownerId } }) : null;
    if (ref.personId && !person) throw new NotFoundException('Person not found');
    if (!person) {
      const name = ref.name?.trim();
      if (!name) throw new BadRequestException('Pick a person or enter a name');
      person = (await this.prisma.person.findFirst({ where: { ownerId, name } })) ?? (await this.prisma.person.create({ data: { ownerId, name } }));
    }
    await this.prisma.eventPerson.upsert({
      where: { eventId_personId: { eventId, personId: person.id } }, update: {}, create: { eventId, personId: person.id },
    });
    return person;
  }

  /** Switch the public link and guest expenses on / off. The token is created on first use. */
  async updateSharing(ownerId: string, id: string, dto: UpdateSharingDto) {
    const e = await this.owned(ownerId, id);
    const token = dto.regenerate || !e.shareToken ? randomBytes(24).toString('base64url') : e.shareToken;
    const enabled = dto.enabled ?? e.shareEnabled;
    const updated = await this.prisma.event.update({
      where: { id },
      data: { shareToken: token, shareEnabled: enabled, allowGuestExpenses: enabled ? (dto.allowGuestExpenses ?? e.allowGuestExpenses) : false },
    });
    return view(updated);
  }

  private async bySharedToken(token: string) {
    const e = await this.prisma.event.findFirst({ where: { shareToken: token, shareEnabled: true }, include: { owner: { select: { name: true } } } });
    if (!e) throw new NotFoundException('This link is not available');
    return e;
  }

  /** What anyone with the link sees: names, shares and the others' expenses - never the owner's accounts or transactions. */
  async publicView(token: string) {
    const e = await this.bySharedToken(token);
    const mine = await this.ledger.totals({ ownerId: e.ownerId, eventId: e.id });
    const s = await this.sharing(e.ownerId, e.id, mine.expense);
    return {
      name: e.name, notes: e.notes, startDate: e.startDate, endDate: e.endDate, isActive: e.isActive,
      canAddExpenses: e.allowGuestExpenses && e.isActive, ownerName: e.owner.name,
      totalCost: s.totalCost, members: s.members.map((m) => ({ ...m, name: m.personId === null ? e.owner.name : m.name, isOwner: m.personId === null })),
      expenses: s.expenses.map((x) => ({ title: x.title, amount: x.amount, occurredAt: x.occurredAt, personName: x.person.name })),
    };
  }

  async addGuestExpense(token: string, dto: GuestExpenseDto) {
    const e = await this.bySharedToken(token);
    if (!e.allowGuestExpenses || !e.isActive) throw new ConflictException('Adding expenses is switched off for this event');
    if ((await this.prisma.eventExpense.count({ where: { eventId: e.id } })) >= 500) throw new ConflictException('This event has reached its expense limit');
    const person = await this.resolvePerson(e.ownerId, e.id, { name: dto.name });
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    assertSaneInstant(occurredAt);
    await this.prisma.eventExpense.create({
      data: { ownerId: e.ownerId, eventId: e.id, personId: person.id, title: dto.title.trim(), amount: big(dto.amount), occurredAt, addedByGuest: true },
    });
  }

  async people(ownerId: string) {
    const rows = await this.prisma.person.findMany({ where: { ownerId }, orderBy: { name: 'asc' } });
    return rows.map((p) => ({ id: p.id, name: p.name }));
  }

  async addPerson(ownerId: string, eventId: string, dto: AddPersonDto) {
    await this.owned(ownerId, eventId);
    const p = await this.resolvePerson(ownerId, eventId, dto);
    return { id: p.id, name: p.name };
  }

  /** Takes someone out of the event; only possible while they have no expenses in it. */
  async removePerson(ownerId: string, eventId: string, personId: string) {
    await this.owned(ownerId, eventId);
    if (await this.prisma.eventExpense.findFirst({ where: { eventId, personId } })) {
      throw new ConflictException('Delete their expenses first');
    }
    await this.prisma.eventPerson.deleteMany({ where: { eventId, personId } });
  }

  async addExpense(ownerId: string, eventId: string, dto: CreateExpenseDto) {
    await this.owned(ownerId, eventId);
    const person = await this.resolvePerson(ownerId, eventId, { personId: dto.personId, name: dto.personName });
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    assertSaneInstant(occurredAt);
    const x = await this.prisma.eventExpense.create({
      data: { ownerId, eventId, personId: person.id, title: dto.title.trim(), amount: big(dto.amount), occurredAt, notes: dto.notes || null },
    });
    return { id: x.id };
  }

  async updateExpense(ownerId: string, eventId: string, id: string, dto: UpdateExpenseDto) {
    const x = await this.prisma.eventExpense.findFirst({ where: { id, eventId, ownerId } });
    if (!x) throw new NotFoundException('Expense not found');
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : undefined;
    if (occurredAt) assertSaneInstant(occurredAt);
    const personId = dto.personId ? (await this.resolvePerson(ownerId, eventId, { personId: dto.personId })).id : undefined;
    await this.prisma.eventExpense.update({
      where: { id },
      data: {
        title: dto.title?.trim(), amount: dto.amount === undefined ? undefined : big(dto.amount), personId, occurredAt,
        notes: dto.notes === undefined ? undefined : dto.notes || null,
      },
    });
  }

  async removeExpense(ownerId: string, eventId: string, id: string) {
    const x = await this.prisma.eventExpense.findFirst({ where: { id, eventId, ownerId }, select: { id: true } });
    if (!x) throw new NotFoundException('Expense not found');
    await this.prisma.eventExpense.delete({ where: { id } });
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
