import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RefData } from '../../core/services/ref-data.store';
import { AiApi, AiQueueItem, AiJobState } from './ai.api';
import { AiQueueStore, POLL_MS } from './ai-queue.store';

const item = (state: AiJobState, id = 'a'): AiQueueItem => ({ jobId: id, state, inputText: 'x', result: null, error: null, transaction: null, queuePosition: null, createdAt: '', completedAt: null });

describe('AiQueueStore', () => {
  let queue: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;
  const make = () => { TestBed.configureTestingModule({ providers: [{ provide: AiApi, useValue: { queue, remove: () => of(undefined), clearDone: () => of({ cleared: 0 }) } }, { provide: RefData, useValue: { refreshAccounts: refresh } }] }); return TestBed.inject(AiQueueStore); };
  beforeEach(() => { vi.useFakeTimers(); refresh = vi.fn(() => of(null)); });
  afterEach(() => vi.useRealTimers());

  it('polls while work is pending, refreshes balances when an entry is saved, then stops by itself', () => {
    const seq = [[item('QUEUED')], [item('PROCESSING')], [item('SAVED')]];
    let n = 0;
    queue = vi.fn(() => of(seq[Math.min(n++, 2)]));
    const store = make();
    store.start();
    vi.advanceTimersByTime(POLL_MS * 6);
    expect(queue).toHaveBeenCalledTimes(3); // stopped after the queue went quiet
    expect(store.items()[0].state).toBe('SAVED');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('stops polling when stopped (component destroyed)', () => {
    queue = vi.fn(() => of([item('QUEUED')]));
    const store = make();
    store.start();
    vi.advanceTimersByTime(POLL_MS * 2 + 1);
    const calls = queue.mock.calls.length;
    store.stop();
    vi.advanceTimersByTime(POLL_MS * 10);
    expect(queue).toHaveBeenCalledTimes(calls);
  });

  it('does not poll when nothing is waiting and survives a failed poll', () => {
    queue = vi.fn().mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValue(of([item('NEEDS_REVIEW')]));
    const store = make();
    store.start();
    vi.advanceTimersByTime(POLL_MS * 5);
    expect(queue).toHaveBeenCalledTimes(2); // retry after the failure, then quiet
    expect(store.items()[0].state).toBe('NEEDS_REVIEW');
  });

  it('does not refresh balances for entries that were already saved when the app opened', () => {
    queue = vi.fn(() => of([item('SAVED')]));
    make().start();
    vi.advanceTimersByTime(POLL_MS);
    expect(refresh).not.toHaveBeenCalled();
  });
});
