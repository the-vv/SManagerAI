import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../common/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { DateTime } from 'luxon';
import { SettingsService } from '../settings/settings.service.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import type { AiJob } from '../generated/prisma/client.js';
import { AiClassificationService } from './ai-classification.service.js';
import { AiQueueService } from './ai-queue.service.js';
import { promptLength, sanitizeText } from './classification.js';
import type { CategoryOption, ClassificationInput, ClassificationResult } from './interfaces/ai.interfaces.js';

/** Submission side (HTTP) and processing side (scheduler) of the AI queue. */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: AiQueueService,
    private readonly classifier: AiClassificationService,
    private readonly transactions: TransactionsService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get enabled(): boolean { return this.config.ai.enabled; }

  /** Daily allowance: resets at the user's local midnight. */
  async allowance(userId: string) {
    const tz = await this.settings.timezone(userId);
    const used = await this.queue.countSince(userId, DateTime.now().setZone(tz).startOf('day').toUTC().toJSDate());
    const limit = this.config.ai.dailyLimit;
    return { enabled: this.enabled, dailyLimit: limit, used, remaining: Math.max(0, limit - used) };
  }

  /** Validates and queues. Never calls the model. */
  async submit(userId: string, text: string, accountId?: string) {
    if (!this.enabled) throw new ServiceUnavailableException('AI entry is not configured. Please add the transaction manually.');
    const clean = sanitizeText(text, Number.MAX_SAFE_INTEGER);
    if (!clean) throw new BadRequestException('Describe the transaction first, e.g. "Lunch 250".');
    if (clean.length > this.config.ai.maxInputChars) {
      throw new BadRequestException(`Keep it short (at most ${this.config.ai.maxInputChars} characters).`);
    }
    if ((await this.allowance(userId)).remaining <= 0) {
      throw new HttpException('Daily AI limit reached. It resets tomorrow - you can still add transactions manually.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if ((await this.queue.countActive(userId)) >= this.config.ai.maxPendingPerUser) {
      throw new HttpException('Too many transactions are waiting for AI. Please wait a moment.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (accountId) {
      const acc = await this.prisma.account.findFirst({ where: { id: accountId, ownerId: userId, isActive: true }, select: { id: true } });
      if (!acc) throw new BadRequestException('That account is not available. Pick another account.');
    }
    const job = await this.queue.enqueue(userId, clean, accountId);
    return { jobId: job.id, status: job.status, message: 'Queued. It will be added to your transactions automatically.' };
  }

  /** Called once at boot: nothing can really be in flight after a restart. */
  async recoverAfterRestart(): Promise<void> {
    const n = await this.queue.recoverStale({ all: true });
    if (n > 0) this.logger.warn(`Recovered ${n} AI job(s) interrupted by a restart`);
  }

  /**
   * One scheduler run. Returns immediately (skipped) if a batch is already being processed, so
   * there is never more than one inference at a time. No DB transaction is open during HTTP calls.
   */
  async processBatch(): Promise<{ skipped: boolean; claimed: number; completed: number }> {
    if (!this.enabled || this.running) return { skipped: true, claimed: 0, completed: 0 };
    this.running = true;
    const started = Date.now();
    let claimed = 0, completed = 0, retried = 0, failed = 0;
    try {
      await this.queue.recoverStale();
      const jobs = await this.queue.claimBatch(this.config.ai.batchSize);
      claimed = jobs.length;
      if (!claimed) { await this.saveUnsaved(); return { skipped: false, claimed, completed }; }

      const categories = await this.categoriesByUser([...new Set(jobs.map((j) => j.userId))]);
      const chunks = this.chunk(jobs, categories);
      const token = jobs[0].claimToken!;
      for (let i = 0; i < chunks.length; i++) {
        await this.queue.renewLease(chunks.slice(i).flat().map((j) => j.id), token);
        const r = await this.runChunk(chunks[i], categories);
        completed += r.completed; retried += r.retried; failed += r.failed;
      }
      await this.saveUnsaved();
      return { skipped: false, claimed, completed };
    } finally {
      this.running = false;
      if (claimed) {
        // counts and timing only - never the transaction text
        this.logger.log(`AI batch: ${claimed} claimed, ${completed} completed, ${retried} to retry, ${failed} failed in ${Date.now() - started}ms`);
      }
    }
  }

  private async runChunk(chunk: AiJob[], categories: Map<string, CategoryOption[]>) {
    const inputs: ClassificationInput[] = chunk.map((j) => ({ jobId: j.id, text: j.inputText, categories: categories.get(j.userId) ?? [] }));
    let outcomes;
    try {
      outcomes = await this.classifier.classify(inputs);
    } catch (e) {
      this.logger.warn(`AI request failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      const r = { completed: 0, retried: 0, failed: 0 };
      for (const job of chunk) (await this.queue.retryOrFail(job)) === 'failed' ? r.failed++ : r.retried++;
      return r;
    }
    const r = { completed: 0, retried: 0, failed: 0 };
    for (const job of chunk) {
      const o = outcomes.get(job.id);
      if (o?.ok) {
        if (await this.queue.complete(job, o.result)) { r.completed++; await this.autoSave(job.id, job.userId, job.createdAt, o.result, job.accountId); }
        continue;
      }
      (await this.queue.retryOrFail(job)) === 'failed' ? r.failed++ : r.retried++;
    }
    return r;
  }

  /**
   * Turns a classified entry into a real transaction (default account, dated when the user
   * entered it). Idempotent: the unique `aiJobId` means a repeat never creates a second one.
   * Anything we cannot save safely (no amount, no account...) stays in the queue for the user.
   */
  private async autoSave(jobId: string, userId: string, enteredAt: Date, r: ClassificationResult, accountId: string | null): Promise<void> {
    if (r.amount === null) { await this.queue.markNeedsReview(jobId, 'No amount found. Add the amount to save it.'); return; }
    try {
      await this.transactions.create(userId, {
        title: r.title, amount: r.amount, kind: r.type, categoryId: r.categoryId, occurredAt: enteredAt.toISOString(), aiJobId: jobId,
        ...(accountId ? { accountId } : {}), // else the user's default account
      });
    } catch (e) {
      const msg = e instanceof HttpException && e.getStatus() < 500 ? 'Could not be added automatically. Check your account and add it manually.' : 'Could not be added automatically. Please add it manually.';
      this.logger.warn(`AI auto-save failed: ${e instanceof Error ? e.constructor.name : 'error'}`); // no text, no amounts
      await this.queue.markNeedsReview(jobId, msg);
    }
  }

  /** Catches entries completed just before a crash/restart that never became a transaction. */
  private async saveUnsaved(): Promise<void> {
    for (const j of await this.queue.findUnsaved()) {
      await this.autoSave(j.id, j.userId, j.createdAt, JSON.parse(j.result!) as ClassificationResult, j.accountId);
    }
  }

  /** Sequential chunks, each within the prompt budget (small models degrade with long prompts). */
  private chunk(jobs: AiJob[], categories: Map<string, CategoryOption[]>): AiJob[][] {
    const out: AiJob[][] = [];
    let cur: AiJob[] = [], size = 0;
    for (const j of jobs) {
      const len = promptLength({ text: j.inputText, categories: categories.get(j.userId) ?? [] });
      if (cur.length && size + len > this.config.ai.maxPromptChars) { out.push(cur); cur = []; size = 0; }
      cur.push(j); size += len;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  /** Each user's own active categories only - ids are never shared across users. */
  private async categoriesByUser(userIds: string[]): Promise<Map<string, CategoryOption[]>> {
    const rows = await this.prisma.category.findMany({
      where: { ownerId: { in: userIds }, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, ownerId: true, name: true, type: true },
    });
    const map = new Map<string, CategoryOption[]>(userIds.map((u) => [u, []]));
    for (const r of rows) map.get(r.ownerId)!.push({ id: r.id, name: r.name, type: r.type });
    return map;
  }
}
