import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadingService, SHOW_AFTER_MS, SLOW_AFTER_MS } from './loading.service';

describe('LoadingService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not show for quick requests', () => {
    const s = new LoadingService();
    s.begin(); vi.advanceTimersByTime(SHOW_AFTER_MS - 50); s.end(); vi.advanceTimersByTime(10_000);
    expect(s.visible()).toBe(false);
  });

  it('shows after the delay, flags slow requests, and hides when the last request ends', () => {
    const s = new LoadingService();
    s.begin(); s.begin();
    vi.advanceTimersByTime(SHOW_AFTER_MS + 1);
    expect(s.visible()).toBe(true); expect(s.slow()).toBe(false);
    vi.advanceTimersByTime(SLOW_AFTER_MS);
    expect(s.slow()).toBe(true);
    s.end(); expect(s.visible()).toBe(true); // one still running
    s.end(); expect(s.visible()).toBe(false); expect(s.slow()).toBe(false);
  });

  it('tolerates unbalanced end() calls', () => {
    const s = new LoadingService();
    s.end(); s.begin(); vi.advanceTimersByTime(SHOW_AFTER_MS + 1);
    expect(s.visible()).toBe(true);
  });
});
