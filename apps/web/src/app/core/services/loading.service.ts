import { Injectable, signal } from '@angular/core';

/** Show the spinner only if work takes longer than this (so quick requests never flash it). */
export const SHOW_AFTER_MS = 400;
/** Switch the message to "taking longer than usual" after this. */
export const SLOW_AFTER_MS = 5000;

/**
 * Counts in-flight API requests and exposes `visible` / `slow` for the global spinner toast.
 * Background polling is excluded by the interceptor (see QUIET_URLS).
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  readonly visible = signal(false);
  readonly slow = signal(false);
  private pending = 0;
  private showTimer?: ReturnType<typeof setTimeout>;
  private slowTimer?: ReturnType<typeof setTimeout>;

  begin(): void {
    if (++this.pending !== 1) return;
    this.showTimer = setTimeout(() => this.visible.set(true), SHOW_AFTER_MS);
    this.slowTimer = setTimeout(() => this.slow.set(true), SLOW_AFTER_MS);
  }

  end(): void {
    if (this.pending === 0 || --this.pending > 0) return;
    clearTimeout(this.showTimer); clearTimeout(this.slowTimer);
    this.visible.set(false); this.slow.set(false);
  }
}
