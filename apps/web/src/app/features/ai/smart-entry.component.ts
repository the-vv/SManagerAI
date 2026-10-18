import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { Toast } from '../../core/services/toast.service';
import { SelectComponent } from '../../shared/components/select.component';
import { AiApi } from './ai.api';
import { AiQueueStore } from './ai-queue.store';

/**
 * Fire-and-forget: the text is queued on the server and turned into a transaction there, so the
 * user can send it and close the app. Progress is shown in the queue list below (sm-ai-queue).
 */
@Component({
  selector: 'sm-smart-entry',
  imports: [TuiIcon, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block max-w-full min-w-0' },
  template: `
    <section class="card rise mb-3 max-w-full min-w-0 border-accent/30 p-3" aria-label="Smart Entry">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><tui-icon icon="@tui.zap" /></span>
        <h2 class="m-0 text-sm font-semibold">Smart Entry</h2>
        <span class="rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-semibold tracking-wide text-accent">AI</span>
        @if (allowance(); as a) {
          @if (a.enabled) {
            <div class="ml-auto flex min-w-0 items-center gap-2">
              <!-- the account the entry will be added to (Taiga dropdown, compact) -->
              @if (accounts().length > 1) {
                <sm-select class="w-36 sm:w-44" size="s" ariaLabel="Add to account" [options]="accountOpts()" [value]="selectedId()" (valueChange)="chosen.set($event)" />
              }
            </div>
          }
        }
      </div>

      @if (allowance()?.enabled === false) {
        <p class="m-0 mt-2 text-xs text-muted">AI entry isn't set up on this server.
          <button type="button" class="link-btn" (click)="manual()">Add a transaction manually</button>.</p>
      } @else {
        <form class="mt-2 flex min-w-0 gap-2" (submit)="$event.preventDefault(); send()" novalidate>
          <input class="input min-w-0 flex-1 !min-h-10" name="smart-text" aria-label="Describe a transaction" autocomplete="off" maxlength="200"
            placeholder="Lunch ₹250, Salary ₹80,000, Petrol ₹1,200…" [value]="text()" (input)="text.set($any($event.target).value)"
            [disabled]="sending()" [class.invalid]="!!error()" />
          <button type="submit" class="btn btn-primary !min-h-10 shrink-0 !px-3" aria-label="Analyze" [disabled]="sending() || !text().trim() || outOfCredits()">
            <tui-icon icon="@tui.zap" /> <span class="hidden sm:inline">{{ sending() ? 'Sending…' : 'Analyze' }}</span>
          </button>
        </form>
        @if (error()) { <div class="error-text" role="alert">{{ error() }}</div> }
        @else if (outOfCredits()) { <div class="error-text">Daily AI limit reached. <button type="button" class="link-btn" (click)="manual()">Add manually</button></div> }
        @else {
          <div class="flex items-center justify-start gap-1">
            <p class="m-0 mt-1 truncate text-[11px] text-muted">Send and forget - Transaction creates automatically.</p>
              @if (allowance(); as a) {
                <span class="shrink-0 mt-1 text-xs whitespace-nowrap" [class.text-muted]="a.remaining > 0" [class.text-expense]="a.remaining === 0"
                  [title]="'AI entries left today (limit ' + a.dailyLimit + ')'">
                  <b class="num"> {{ a.remaining }}</b> left<span class="hidden sm:inline"> today</span>
                </span>
              }
          </div>
         }
      }
    </section>
  `,
})
export class SmartEntryComponent {
  private readonly api = inject(AiApi);
  private readonly store = inject(AiQueueStore);
  private readonly toast = inject(Toast);
  private readonly dialogs = inject(Dialogs);
  private readonly ref = inject(RefData);

  protected readonly allowance = this.store.allowance;
  protected readonly outOfCredits = computed(() => (this.allowance()?.remaining ?? 1) <= 0);
  protected readonly text = signal('');
  protected readonly sending = signal(false);
  protected readonly accounts = this.ref.activeAccounts;
  protected readonly accountOpts = computed(() => this.accounts().map((a) => ({ value: a.id as string | null, label: a.name })));
  /** the user's pick; null = follow the default account. It stays selected (and visible) until changed. */
  protected readonly chosen = signal<string | null>(null);
  protected readonly selectedId = computed(() => {
    const c = this.chosen();
    return c && this.accounts().some((a) => a.id === c) ? c : (this.ref.defaultAccount()?.id ?? null);
  });
  protected readonly error = signal('');

  constructor() { this.store.loadAllowance(); }

  protected send(): void {
    // only send an account when it differs from the default, so "default" keeps meaning the default
    const picked = this.selectedId();
    const accountId = picked && picked !== this.ref.defaultAccount()?.id ? picked : undefined;
    const text = this.text().trim();
    if (!text || this.sending()) return;
    this.error.set('');
    this.sending.set(true);
    this.api.classify(text, accountId).subscribe({
      next: () => {
        this.sending.set(false);
        this.text.set(''); // sent: the server holds it now, the app can be closed
        this.toast.info(accountId ? `Queued – it will be added to ${this.ref.accountById(accountId)?.name ?? 'that account'}.` : 'Queued – it will be added to your transactions automatically.');
        this.store.start();
        this.store.loadAllowance();
      },
      error: (e) => {
        this.sending.set(false); // the text stays so nothing is lost
        if (e?.status === 400 || e?.status === 429) { this.error.set(e.message); this.store.loadAllowance(); }
        else this.toast.error(e, 'Could not reach the server. Your text is kept – try again or add it manually.');
      },
    });
  }

  protected manual(): void { void this.dialogs.transaction(); }
}
