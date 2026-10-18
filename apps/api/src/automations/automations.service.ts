import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { big, num } from '../common/money.js';
import {
  addDaysToDate, assertDate, instantAtLocalHour, localDateOf, startOfLocalDay, todayLocal,
} from '../common/time.js';
import { PrismaService, Tx } from '../database/prisma.service.js';
import { Automation, Prisma, Transaction } from '../generated/prisma/client.js';
import { TransactionWriter } from '../ledger/transaction-writer.js';
import { SettingsService } from '../settings/settings.service.js';
import type { InlineAutomationDto } from '../transactions/dto.js';
import { ConfirmExecutionDto, CreateAutomationDto, UpdateAutomationDto } from './dto.js';
import {
  ScheduleSpec, dateForIndex, firstIndexOnOrAfter, monthlyEquivalent, occurrenceDate, occurrencesBetween,
} from './schedule.js';

/** Safety valve: never process more than this many occurrences of one automation per run. */
const MAX_CATCH_UP = 400;

export const specOf = (a: Automation): ScheduleSpec => ({
  frequency: a.frequency, customEvery: a.customEvery, customUnit: a.customUnit,
  startDate: a.startDate, dayOfMonth: a.dayOfMonth,
});

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);
  /** Overridable in tests so schedules can be exercised at fixed dates. */
  clock: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: TransactionWriter,
    private readonly settings: SettingsService,
  ) {}

  // ------------------------------------------------------------------ views

  view(a: Automation & { account?: { name: string } | null; category?: { name: string; color: string | null } | null }) {
    return {
      id: a.id, title: a.title, kind: a.kind, amount: num(a.amount), description: a.description,
      accountId: a.accountId, accountName: a.account?.name ?? null,
      categoryId: a.categoryId, categoryName: a.category?.name ?? null, categoryColor: a.category?.color ?? null,
      frequency: a.frequency, customEvery: a.customEvery, customUnit: a.customUnit, dayOfMonth: a.dayOfMonth,
      startDate: a.startDate, endDate: a.endDate, nextRunDate: a.nextRunDate, mode: a.mode,
      reminderDaysBefore: a.reminderDaysBefore, isEnabled: a.isEnabled, lastRunAt: a.lastRunAt,
      monthlyEquivalent: monthlyEquivalent(a, num(a.amount)),
      finished: a.nextRunDate === null,
    };
  }

  // ------------------------------------------------------------------ CRUD

  async list(ownerId: string) {
    const rows = await this.prisma.automation.findMany({
      where: { ownerId },
      include: { account: { select: { name: true } }, category: { select: { name: true, color: true } } },
      orderBy: [{ isEnabled: 'desc' }, { nextRunDate: 'asc' }, { title: 'asc' }],
    });
    return rows.map((r) => this.view(r));
  }

  private async getOwned(ownerId: string, id: string) {
    const a = await this.prisma.automation.findFirst({
      where: { id, ownerId },
      include: { account: { select: { name: true } }, category: { select: { name: true, color: true } } },
    });
    if (!a) throw new NotFoundException('Automation not found');
    return a;
  }

  async get(ownerId: string, id: string) {
    return this.view(await this.getOwned(ownerId, id));
  }

  private validateSchedule(d: {
    frequency: string; customEvery?: number | null; customUnit?: string | null;
    startDate: string; endDate?: string | null;
  }) {
    assertDate(d.startDate, 'startDate');
    if (d.endDate) {
      assertDate(d.endDate, 'endDate');
      if (d.endDate < d.startDate) throw new BadRequestException('End date must not be before the start date');
    }
    if (d.frequency === 'CUSTOM' && (!d.customEvery || !d.customUnit)) {
      throw new BadRequestException('Custom frequency needs "every N" and a unit');
    }
  }

  async create(ownerId: string, dto: CreateAutomationDto) {
    const prefs = await this.settings.get(ownerId);
    this.validateSchedule(dto);
    const today = todayLocal(prefs.timezone, this.clock());
    const at = startOfLocalDay(dto.startDate, prefs.timezone);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.writer.assertAccountUsable(tx, ownerId, dto.accountId, at);
      if (dto.categoryId) await this.writer.assertCategory(tx, ownerId, dto.categoryId, dto.kind);
      const spec: ScheduleSpec = {
        frequency: dto.frequency, customEvery: dto.customEvery, customUnit: dto.customUnit,
        startDate: dto.startDate, dayOfMonth: this.monthAnchor(dto.frequency, dto.customUnit, dto.dayOfMonth),
      };
      const nextIndex = dto.backfill ? 0 : firstIndexOnOrAfter(spec, today > dto.startDate ? today : dto.startDate);
      return tx.automation.create({
        data: {
          ownerId, title: dto.title.trim(), kind: dto.kind, amount: big(dto.amount),
          accountId: dto.accountId, categoryId: dto.categoryId ?? null, description: dto.description || null,
          frequency: dto.frequency, customEvery: dto.customEvery ?? null, customUnit: dto.customUnit ?? null,
          dayOfMonth: spec.dayOfMonth ?? null, startDate: dto.startDate, endDate: dto.endDate ?? null,
          nextIndex, nextRunDate: dateForIndex(spec, nextIndex, dto.endDate),
          mode: dto.mode ?? prefs.defaultAutomationMode,
          reminderDaysBefore: dto.reminderDaysBefore ?? 0,
        },
      });
    });
    // catch up immediately so the user sees backfilled/due items without waiting for the next tick
    await this.processAutomation(created.id).catch((e) => this.logger.error(e));
    return this.get(ownerId, created.id);
  }

  /** Month-based schedules need an anchor day; for day/week schedules it is meaningless. */
  private monthAnchor(freq: string, unit?: string | null, dom?: number | null): number | null {
    const monthly = freq === 'CUSTOM' ? unit === 'MONTH' : !['DAILY', 'WEEKLY'].includes(freq);
    return monthly ? dom ?? null : null;
  }

  async update(ownerId: string, id: string, dto: UpdateAutomationDto) {
    const existing = await this.getOwned(ownerId, id);
    const prefs = await this.settings.get(ownerId);
    const merged = {
      frequency: dto.frequency ?? existing.frequency,
      customEvery: dto.customEvery === undefined ? existing.customEvery : dto.customEvery,
      customUnit: dto.customUnit === undefined ? existing.customUnit : dto.customUnit,
      startDate: dto.startDate ?? existing.startDate,
      endDate: dto.endDate === undefined ? existing.endDate : dto.endDate,
      dayOfMonth: dto.dayOfMonth === undefined ? existing.dayOfMonth : dto.dayOfMonth,
    };
    this.validateSchedule(merged);
    const kind = dto.kind ?? existing.kind;
    const spec: ScheduleSpec = {
      ...merged, dayOfMonth: this.monthAnchor(merged.frequency, merged.customUnit, merged.dayOfMonth),
    };
    const scheduleChanged =
      merged.frequency !== existing.frequency || merged.customEvery !== existing.customEvery ||
      merged.customUnit !== existing.customUnit || merged.startDate !== existing.startDate ||
      spec.dayOfMonth !== existing.dayOfMonth;
    const resumed = dto.isEnabled === true && !existing.isEnabled;
    const today = todayLocal(prefs.timezone, this.clock());

    await this.prisma.$transaction(async (tx) => {
      if (dto.accountId) await this.writer.assertAccountUsable(tx, ownerId, dto.accountId, startOfLocalDay(merged.startDate, prefs.timezone));
      const categoryId = dto.categoryId === undefined ? existing.categoryId : dto.categoryId;
      if (categoryId) await this.writer.assertCategory(tx, ownerId, categoryId, kind);

      let nextIndex = existing.nextIndex;
      // A changed schedule restarts from today; resuming after a pause skips what was missed while paused.
      if (scheduleChanged || resumed) {
        const from = today > merged.startDate ? today : merged.startDate;
        nextIndex = firstIndexOnOrAfter(spec, from);
        if (!scheduleChanged) nextIndex = Math.max(nextIndex, existing.nextIndex);
      }
      await tx.automation.update({
        where: { id },
        data: {
          title: dto.title?.trim(), kind, amount: dto.amount === undefined ? undefined : big(dto.amount),
          accountId: dto.accountId, categoryId,
          description: dto.description === undefined ? undefined : dto.description || null,
          frequency: merged.frequency, customEvery: merged.frequency === 'CUSTOM' ? merged.customEvery : null,
          customUnit: merged.frequency === 'CUSTOM' ? merged.customUnit : null,
          dayOfMonth: spec.dayOfMonth, startDate: merged.startDate, endDate: merged.endDate,
          mode: dto.mode, reminderDaysBefore: dto.reminderDaysBefore, isEnabled: dto.isEnabled,
          nextIndex, nextRunDate: dateForIndex(spec, nextIndex, merged.endDate),
        },
      });
    });
    return this.get(ownerId, id);
  }

  async remove(ownerId: string, id: string) {
    const res = await this.prisma.automation.deleteMany({ where: { id, ownerId } });
    if (res.count === 0) throw new NotFoundException('Automation not found');
  }

  // ------------------------------------------------------------------ create from a transaction

  /** "Make this recurring": the source transaction is occurrence #0, so it is never recorded twice. */
  async createFromTransaction(
    tx: Tx, ownerId: string, src: Transaction, inline: InlineAutomationDto,
    prefs: { timezone: string; defaultMode: 'AUTO' | 'REMINDER'; reminderDaysBefore: number },
  ) {
    if (src.kind !== 'INCOME' && src.kind !== 'EXPENSE') throw new BadRequestException('Transfers cannot be automated');
    const startDate = localDateOf(src.occurredAt, prefs.timezone);
    if (inline.endDate) this.validateSchedule({ ...inline, startDate });
    this.validateSchedule({ ...inline, startDate });
    const dom = DateTime.fromISO(startDate).day;
    const spec: ScheduleSpec = {
      frequency: inline.frequency, customEvery: inline.customEvery, customUnit: inline.customUnit,
      startDate, dayOfMonth: this.monthAnchor(inline.frequency, inline.customUnit, dom),
    };
    const nextIndex = 1;
    const auto = await tx.automation.create({
      data: {
        ownerId, title: src.title, kind: src.kind, amount: src.amount, accountId: src.accountId,
        categoryId: src.categoryId, description: src.notes, frequency: inline.frequency,
        customEvery: inline.customEvery ?? null, customUnit: inline.customUnit ?? null,
        dayOfMonth: spec.dayOfMonth ?? null, startDate, endDate: inline.endDate ?? null,
        nextIndex, nextRunDate: dateForIndex(spec, nextIndex, inline.endDate),
        mode: inline.mode ?? prefs.defaultMode, reminderDaysBefore: prefs.reminderDaysBefore,
      },
    });
    await tx.transaction.update({ where: { id: src.id }, data: { automationId: auto.id, occurrenceDate: startDate } });
    await tx.automationExecution.create({
      data: {
        ownerId, automationId: auto.id, scheduledFor: startDate, occurrenceKey: `${auto.id}:${startDate}`,
        status: 'SUCCESS', transactionId: src.id, amount: src.amount, executedAt: new Date(),
      },
    });
    return auto;
  }

  // ------------------------------------------------------------------ processing (scheduler)

  /** Scheduler entry point: process every due automation of every user. Safe to call repeatedly. */
  async processAllDue(now: Date = this.clock()): Promise<{ processed: number }> {
    // conservative UTC bound (timezones span -12..+14h); precise per-user "today" is checked below
    const bound = addDaysToDate(now.toISOString().slice(0, 10), 1);
    const candidates = await this.prisma.automation.findMany({
      where: { isEnabled: true, nextRunDate: { not: null, lte: bound } },
      select: { id: true, ownerId: true, nextRunDate: true },
    });
    const tzCache = new Map<string, string>();
    let processed = 0;
    for (const c of candidates) {
      if (!tzCache.has(c.ownerId)) tzCache.set(c.ownerId, await this.settings.timezone(c.ownerId));
      if (c.nextRunDate! > todayLocal(tzCache.get(c.ownerId)!, now)) continue;
      try {
        processed += await this.processAutomation(c.id, now);
      } catch (e) {
        this.logger.error(`Automation ${c.id} failed: ${e instanceof Error ? e.stack : e}`);
      }
    }
    return { processed };
  }

  /** Process all due occurrences of one automation (catch-up after downtime included). */
  async processAutomation(automationId: string, now: Date = this.clock()): Promise<number> {
    let count = 0;
    for (let i = 0; i < MAX_CATCH_UP; i++) {
      const a = await this.prisma.automation.findUnique({ where: { id: automationId } });
      if (!a || !a.isEnabled || !a.nextRunDate) break;
      const tz = await this.settings.timezone(a.ownerId);
      if (a.nextRunDate > todayLocal(tz, now)) break;
      await this.processOccurrence(a, tz);
      count++;
    }
    return count;
  }

  private async processOccurrence(a: Automation, tz: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // re-read inside the transaction: if another run already advanced it, do nothing
        const fresh = await tx.automation.findUnique({ where: { id: a.id } });
        if (!fresh || fresh.nextIndex !== a.nextIndex || !fresh.nextRunDate) return;
        const date = fresh.nextRunDate;
        const key = `${fresh.id}:${date}`;
        const done = await tx.automationExecution.findUnique({ where: { occurrenceKey: key } });
        if (!done) {
          if (fresh.mode === 'AUTO') {
            const row = await this.writer.record(tx, fresh.ownerId, {
              accountId: fresh.accountId, categoryId: fresh.categoryId, kind: fresh.kind, amount: num(fresh.amount),
              title: fresh.title, notes: fresh.description, occurredAt: instantAtLocalHour(date, tz),
              source: 'AUTOMATION_AUTO', automationId: fresh.id, occurrenceDate: date,
            });
            await tx.automationExecution.create({
              data: {
                ownerId: fresh.ownerId, automationId: fresh.id, scheduledFor: date, occurrenceKey: key,
                status: 'SUCCESS', transactionId: row.id, amount: fresh.amount, executedAt: new Date(),
              },
            });
          } else {
            await tx.automationExecution.create({
              data: {
                ownerId: fresh.ownerId, automationId: fresh.id, scheduledFor: date, occurrenceKey: key,
                status: 'PENDING', amount: fresh.amount,
              },
            });
          }
        }
        await this.advance(tx, fresh);
      });
    } catch (e) {
      if (!(e instanceof HttpException)) {
        // P2002 = lost a race on the unique occurrence key: another run recorded it; just move on
        if ((e as { code?: string }).code !== 'P2002') throw e;
        await this.prisma.$transaction(async (tx) => {
          const fresh = await tx.automation.findUnique({ where: { id: a.id } });
          if (fresh && fresh.nextIndex === a.nextIndex) await this.advance(tx, fresh);
        });
        return;
      }
      // Business-rule failure (inactive account, deleted category...). Record it and move on so
      // one bad occurrence cannot block the schedule; the user can retry it from the UI.
      await this.prisma.$transaction(async (tx) => {
        const fresh = await tx.automation.findUnique({ where: { id: a.id } });
        if (!fresh || fresh.nextIndex !== a.nextIndex || !fresh.nextRunDate) return;
        const date = fresh.nextRunDate;
        await tx.automationExecution.upsert({
          where: { occurrenceKey: `${fresh.id}:${date}` },
          create: {
            ownerId: fresh.ownerId, automationId: fresh.id, scheduledFor: date,
            occurrenceKey: `${fresh.id}:${date}`, status: 'FAILED', amount: fresh.amount,
            error: e.message.slice(0, 300), executedAt: new Date(),
          },
          update: {},
        });
        await this.advance(tx, fresh);
      });
    }
  }

  private async advance(tx: Tx, a: Automation): Promise<void> {
    const nextIndex = a.nextIndex + 1;
    await tx.automation.update({
      where: { id: a.id },
      data: { nextIndex, nextRunDate: dateForIndex(specOf(a), nextIndex, a.endDate), lastRunAt: new Date() },
    });
  }

  // ------------------------------------------------------------------ executions / reminders

  private execView(e: Prisma.AutomationExecutionGetPayload<{ include: { automation: { select: { title: true; kind: true; accountId: true } } } }>) {
    return {
      id: e.id, automationId: e.automationId, title: e.automation.title, kind: e.automation.kind,
      scheduledFor: e.scheduledFor, status: e.status, amount: num(e.amount), transactionId: e.transactionId,
      error: e.error, executedAt: e.executedAt, createdAt: e.createdAt,
    };
  }

  async executions(ownerId: string, automationId: string, limit = 50) {
    await this.getOwned(ownerId, automationId);
    const rows = await this.prisma.automationExecution.findMany({
      where: { ownerId, automationId }, orderBy: { scheduledFor: 'desc' }, take: limit,
      include: { automation: { select: { title: true, kind: true, accountId: true } } },
    });
    return rows.map((r) => this.execView(r));
  }

  /** Pending reminders and failed runs that need attention. */
  async pending(ownerId: string) {
    const rows = await this.prisma.automationExecution.findMany({
      where: { ownerId, status: { in: ['PENDING', 'FAILED'] } }, orderBy: { scheduledFor: 'asc' },
      include: { automation: { select: { title: true, kind: true, accountId: true } } },
    });
    return rows.map((r) => this.execView(r));
  }

  async confirmExecution(ownerId: string, executionId: string, dto: ConfirmExecutionDto) {
    const tz = await this.settings.timezone(ownerId);
    await this.prisma.$transaction(async (tx) => {
      const ex = await tx.automationExecution.findFirst({
        where: { id: executionId, ownerId }, include: { automation: true },
      });
      if (!ex) throw new NotFoundException('Reminder not found');
      if (ex.status !== 'PENDING' && ex.status !== 'FAILED') throw new BadRequestException('This occurrence was already handled');
      const a = ex.automation;
      const date = dto.date ?? ex.scheduledFor;
      assertDate(date, 'date');
      const row = await this.writer.record(tx, ownerId, {
        accountId: a.accountId, categoryId: a.categoryId, kind: a.kind, amount: dto.amount ?? num(ex.amount),
        title: a.title, notes: a.description,
        occurredAt: date === todayLocal(tz, this.clock()) ? this.clock() : instantAtLocalHour(date, tz),
        source: 'AUTOMATION_CONFIRMED', automationId: a.id, occurrenceDate: ex.scheduledFor,
      });
      await tx.automationExecution.update({
        where: { id: ex.id },
        data: { status: 'SUCCESS', transactionId: row.id, amount: row.amount, error: null, executedAt: new Date() },
      });
    });
  }

  async skipExecution(ownerId: string, executionId: string) {
    const res = await this.prisma.automationExecution.updateMany({
      where: { id: executionId, ownerId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SKIPPED', executedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Reminder not found');
  }

  // ------------------------------------------------------------------ upcoming

  /** Scheduled occurrences in the next `days` days (for dashboard / automations page). */
  async upcoming(ownerId: string, opts: { days?: number; accountId?: string; limit?: number } = {}) {
    const tz = await this.settings.timezone(ownerId);
    const today = todayLocal(tz, this.clock());
    const until = addDaysToDate(today, opts.days ?? 30);
    const autos = await this.prisma.automation.findMany({
      where: { ownerId, isEnabled: true, nextRunDate: { not: null }, ...(opts.accountId ? { accountId: opts.accountId } : {}) },
      include: { account: { select: { name: true } }, category: { select: { name: true, color: true } } },
    });
    const out: Array<{
      automationId: string; title: string; kind: string; amount: number; date: string; mode: string;
      accountId: string; accountName: string; categoryName: string | null; categoryColor: string | null; dueSoon: boolean;
    }> = [];
    for (const a of autos) {
      for (const o of occurrencesBetween(specOf(a), a.nextIndex, until, a.endDate, 60)) {
        const remindFrom = addDaysToDate(o.date, -a.reminderDaysBefore);
        out.push({
          automationId: a.id, title: a.title, kind: a.kind, amount: num(a.amount), date: o.date, mode: a.mode,
          accountId: a.accountId, accountName: a.account.name, categoryName: a.category?.name ?? null,
          categoryColor: a.category?.color ?? null, dueSoon: a.reminderDaysBefore > 0 && today >= remindFrom,
        });
      }
    }
    out.sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  /** In-app notification feed: reminders awaiting confirmation + occurrences coming up inside their reminder window. */
  async notifications(ownerId: string) {
    const [pending, upcoming] = await Promise.all([this.pending(ownerId), this.upcoming(ownerId, { days: 30 })]);
    return { pending, dueSoon: upcoming.filter((u) => u.dueSoon) };
  }
}

export { occurrenceDate };
