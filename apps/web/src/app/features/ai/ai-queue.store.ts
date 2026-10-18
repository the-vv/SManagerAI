import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, catchError, EMPTY, switchMap, tap, timer } from 'rxjs';
import { RefData } from '../../core/services/ref-data.store';
import { AiAllowance, AiApi, AiQueueItem } from './ai.api';

export const POLL_MS = 5000;

/**
 * The user's AI queue. The server owns the state (SQLite), so closing the app loses nothing; this
 * store only mirrors it. Polling (NestJS only, never the AI server) runs while something is
 * waiting or processing and stops by itself when the queue is quiet or `stop()` is called.
 */
@Injectable({ providedIn: 'root' })
export class AiQueueStore {
  private readonly api = inject(AiApi);
  private readonly ref = inject(RefData);

  readonly items = signal<AiQueueItem[]>([]);
  /** null until loaded; `enabled: false` hides the feature */
  readonly allowance = signal<AiAllowance | null>(null);
  readonly active = computed(() => this.items().filter((i) => i.state === 'QUEUED' || i.state === 'PROCESSING'));
  private sub?: Subscription;
  private known = new Map<string, string>();
  private primed = false;

  /** Fetches now and keeps polling while work is pending. Safe to call repeatedly. */
  start(): void {
    this.sub?.unsubscribe();
    this.sub = timer(0, POLL_MS).pipe(
      switchMap(() => this.api.queue().pipe(catchError(() => EMPTY))), // a failed poll is skipped
      tap((items) => { this.apply(items); }),
    ).subscribe((items) => {
      if (!items.some((i) => i.state === 'QUEUED' || i.state === 'PROCESSING')) this.stop();
    });
  }

  loadAllowance(): void {
    this.api.status().subscribe({ next: (a) => this.allowance.set(a), error: () => undefined });
  }

  stop(): void { this.sub?.unsubscribe(); this.sub = undefined; }

  refresh(): void { this.start(); }

  remove(jobId: string): void {
    this.items.update((l) => l.filter((i) => i.jobId !== jobId));
    this.api.remove(jobId).subscribe({ error: () => this.start() }); // on failure, re-sync with the server
  }

  clearDone(): void {
    this.items.update((l) => l.filter((i) => i.state !== 'SAVED' && i.state !== 'FAILED'));
    this.api.clearDone().subscribe({ error: () => this.start() });
  }

  private apply(items: AiQueueItem[]): void {
    this.items.set(items);
    // an entry that just became a transaction: balances and dashboard totals changed
    const newlySaved = items.some((i) => i.state === 'SAVED' && this.known.get(i.jobId) && this.known.get(i.jobId) !== 'SAVED');
    this.known = new Map(items.map((i) => [i.jobId, i.state]));
    if (newlySaved && this.primed) this.ref.refreshAccounts().subscribe();
    this.primed = true;
  }
}
