import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../common/config.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AiJob } from '../generated/prisma/client.js';
import type { AiJobStatus } from '../generated/prisma/enums.js';
import type { AiJobState, AiJobView, AiSavedTransaction, ClassificationResult } from './interfaces/ai.interfaces.js';

export const JOB_TYPE = 'TRANSACTION_CLASSIFY';
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 10 * 60_000;

const SAVED_VISIBLE_MS = 24 * 3_600_000;

export const FAILED_MESSAGE = 'Unable to identify transaction. Please enter it manually.';

/** Database-backed queue (SQLite). Single-instance by design; no external broker. */
@Injectable()
export class AiQueueService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async enqueue(userId: string, inputText: string, accountId?: string): Promise<AiJob> {
    return this.prisma.aiJob.create({ data: { userId, inputText, jobType: JOB_TYPE, accountId: accountId ?? null } });
  }

  /** Entries submitted since `since` that still count against the allowance (failed ones are refunded). */
  countSince(userId: string, since: Date): Promise<number> {
    return this.prisma.aiJob.count({ where: { userId, createdAt: { gte: since }, status: { not: 'FAILED' } } });
  }

  countActive(userId: string): Promise<number> {
    return this.prisma.aiJob.count({ where: { userId, status: { in: ['PENDING', 'PROCESSING'] } } });
  }

  /** Ownership is part of the query: another user's job id is simply "not found". */
  async getForUser(userId: string, jobId: string): Promise<AiJobView> {
    const job = await this.prisma.aiJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('AI job not found');
    return (await this.views(userId, [job]))[0];
  }

  async listForUser(userId: string, status?: AiJobStatus): Promise<AiJobView[]> {
    const jobs = await this.prisma.aiJob.findMany({
      where: { userId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 20,
    });
    return this.views(userId, jobs);
  }

  /**
   * The user's visible queue: waiting/processing entries, ones that need a human (no amount,
   * could not be saved, failed) and recently added ones. Dismissed entries are hidden.
   */
  async openForUser(userId: string, now = new Date()): Promise<AiJobView[]> {
    const jobs = await this.prisma.aiJob.findMany({
      where: { userId, dismissedAt: null, createdAt: { gt: new Date(now.getTime() - 7 * 86_400_000) } },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
    const views = await this.views(userId, jobs);
    const recent = now.getTime() - SAVED_VISIBLE_MS;
    return views.filter((v) => v.state !== 'SAVED' || (v.completedAt?.getTime() ?? 0) > recent);
  }

  /**
   * The user no longer needs this entry. Anything not yet turned into a transaction is deleted
   * (waiting, processing, needs review, failed) - a worker that finishes it later finds nothing
   * to update and creates nothing. An entry that already became a transaction is only hidden;
   * the transaction itself is never touched.
   */
  async remove(userId: string, jobId: string): Promise<void> {
    const job = await this.prisma.aiJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('AI job not found');
    const saved = job.status === 'COMPLETED'
      ? await this.prisma.transaction.findFirst({ where: { ownerId: userId, aiJobId: jobId }, select: { id: true } })
      : null;
    if (saved) await this.prisma.aiJob.updateMany({ where: { id: jobId, userId }, data: { dismissedAt: new Date() } });
    else await this.prisma.aiJob.deleteMany({ where: { id: jobId, userId } });
  }

  /** Hide every finished entry that needs no further action (saved or failed). */
  async clearDone(userId: string): Promise<number> {
    const views = await this.openForUser(userId);
    const ids = views.filter((v) => v.state === 'SAVED' || v.state === 'FAILED').map((v) => v.jobId);
    if (!ids.length) return 0;
    const r = await this.prisma.aiJob.updateMany({ where: { id: { in: ids }, userId }, data: { dismissedAt: new Date() } });
    return r.count;
  }

  private async views(userId: string, jobs: AiJob[]): Promise<AiJobView[]> {
    const done = jobs.filter((j) => j.status === 'COMPLETED').map((j) => j.id);
    const saved = new Map<string, AiSavedTransaction>();
    if (done.length) {
      const txs = await this.prisma.transaction.findMany({
        where: { ownerId: userId, aiJobId: { in: done } },
        include: { account: { select: { name: true } }, category: { select: { name: true } } },
      });
      for (const t of txs) {
        saved.set(t.aiJobId!, {
          id: t.id, title: t.title, amount: Number(t.amount), kind: t.kind, accountName: t.account.name, categoryName: t.category?.name ?? null,
        });
      }
    }
    return Promise.all(jobs.map((j) => this.view(j, saved.get(j.id) ?? null)));
  }

  private async view(job: AiJob, transaction: AiSavedTransaction | null): Promise<AiJobView> {
    let queuePosition: number | null = null;
    if (job.status === 'PENDING') {
      queuePosition = 1 + (await this.prisma.aiJob.count({
        where: { status: { in: ['PENDING', 'PROCESSING'] }, createdAt: { lt: job.createdAt } },
      }));
    }
    const state: AiJobState = job.status === 'PENDING' ? 'QUEUED' : job.status === 'PROCESSING' ? 'PROCESSING'
      : job.status === 'FAILED' ? 'FAILED' : transaction ? 'SAVED' : 'NEEDS_REVIEW';
    return {
      jobId: job.id, status: job.status, state, inputText: job.inputText,
      result: job.status === 'COMPLETED' && job.result ? (JSON.parse(job.result) as ClassificationResult) : null,
      error: job.status === 'FAILED' ? (job.errorMessage ?? FAILED_MESSAGE) : state === 'NEEDS_REVIEW' ? job.errorMessage : null,
      transaction, queuePosition, createdAt: job.createdAt, completedAt: job.completedAt,
    };
  }

  /** Completed entries nobody has turned into a transaction yet (crash between classify and save). */
  async findUnsaved(limit = 20, now = new Date()): Promise<AiJob[]> {
    const candidates = await this.prisma.aiJob.findMany({
      where: {
        status: 'COMPLETED', errorMessage: null, dismissedAt: null, result: { not: null },
        completedAt: { gt: new Date(now.getTime() - 86_400_000) },
      },
      orderBy: { completedAt: 'asc' }, take: 200,
    });
    if (!candidates.length) return [];
    const saved = new Set((await this.prisma.transaction.findMany({
      where: { aiJobId: { in: candidates.map((c) => c.id) } }, select: { aiJobId: true },
    })).map((t) => t.aiJobId));
    return candidates.filter((c) => !saved.has(c.id)).slice(0, limit);
  }

  /** Records why an entry could not be saved automatically (safe text; shown to the user). */
  markNeedsReview(jobId: string, message: string): Promise<unknown> {
    return this.prisma.aiJob.updateMany({ where: { id: jobId, status: 'COMPLETED' }, data: { errorMessage: message } });
  }

  /**
   * Returns abandoned PROCESSING jobs to the queue (lease expired, or - at boot - everything,
   * because after a restart nothing can really be in flight). Counts as a failed attempt.
   */
  async recoverStale(opts: { all?: boolean } = {}, now = new Date()): Promise<number> {
    const stale = { status: 'PROCESSING' as const, ...(opts.all ? {} : { leaseExpiresAt: { lt: now } }) };
    const max = this.config.ai.maxRetries;
    const exhausted = await this.prisma.aiJob.updateMany({
      where: { ...stale, retryCount: { gte: max } },
      data: { status: 'FAILED', errorMessage: FAILED_MESSAGE, completedAt: now, claimToken: null, leaseExpiresAt: null, retryCount: { increment: 1 } },
    });
    const requeued = await this.prisma.aiJob.updateMany({
      where: stale,
      data: { status: 'PENDING', claimToken: null, leaseExpiresAt: null, nextRetryAt: null, retryCount: { increment: 1 } },
    });
    return exhausted.count + requeued.count;
  }

  /** Atomically claims up to `limit` eligible jobs: SELECT candidates, then flip PENDING->PROCESSING with a token. */
  async claimBatch(limit: number, now = new Date()): Promise<AiJob[]> {
    const candidates = await this.prisma.aiJob.findMany({
      where: { status: 'PENDING', jobType: JOB_TYPE, OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
      orderBy: { createdAt: 'asc' }, take: limit, select: { id: true },
    });
    if (candidates.length === 0) return [];
    const claimToken = randomUUID();
    // `status: PENDING` in the update makes the claim safe even if something else raced us.
    await this.prisma.aiJob.updateMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: 'PENDING' },
      data: { status: 'PROCESSING', claimToken, startedAt: now, leaseExpiresAt: this.lease(now, 2) },
    });
    return this.prisma.aiJob.findMany({ where: { claimToken, status: 'PROCESSING' }, orderBy: { createdAt: 'asc' } });
  }

  /** Extends the lease of jobs still waiting for their (sequential) model call. */
  renewLease(ids: string[], claimToken: string, now = new Date()): Promise<unknown> {
    return this.prisma.aiJob.updateMany({
      where: { id: { in: ids }, claimToken, status: 'PROCESSING' }, data: { leaseExpiresAt: this.lease(now, 2) },
    });
  }

  private lease(now: Date, calls: number): Date {
    return new Date(now.getTime() + calls * this.config.ai.requestTimeoutMs + 30_000);
  }

  /** Writes only if this worker still owns the claim (a recovered/re-claimed job is left alone). */
  async complete(job: AiJob, result: ClassificationResult, now = new Date()): Promise<boolean> {
    const r = await this.prisma.aiJob.updateMany({
      where: { id: job.id, status: 'PROCESSING', claimToken: job.claimToken },
      data: {
        status: 'COMPLETED', result: JSON.stringify(result), errorMessage: null, completedAt: now,
        claimToken: null, leaseExpiresAt: null,
      },
    });
    return r.count === 1;
  }

  /** Failed attempt: retry with exponential backoff, or FAILED once retries are exhausted. */
  async retryOrFail(job: AiJob, now = new Date()): Promise<'retry' | 'failed' | 'lost'> {
    const attempts = job.retryCount + 1;
    const guard = { id: job.id, status: 'PROCESSING' as const, claimToken: job.claimToken };
    if (attempts > this.config.ai.maxRetries) {
      const r = await this.prisma.aiJob.updateMany({
        where: guard,
        data: { status: 'FAILED', retryCount: attempts, errorMessage: FAILED_MESSAGE, completedAt: now, claimToken: null, leaseExpiresAt: null },
      });
      return r.count ? 'failed' : 'lost';
    }
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
    const r = await this.prisma.aiJob.updateMany({
      where: guard,
      data: { status: 'PENDING', retryCount: attempts, nextRetryAt: new Date(now.getTime() + delay), claimToken: null, leaseExpiresAt: null },
    });
    return r.count ? 'retry' : 'lost';
  }
}
