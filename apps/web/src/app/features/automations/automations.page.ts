import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { TuiSwitch } from '@taiga-ui/kit';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { Toast } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent, ErrorStateComponent, PageHeaderComponent, SkeletonComponent } from '../../shared/components/ui.components';
import { Automation, Execution, UpcomingItem } from '../../shared/models/api.models';
import { frequencyLabel } from '../../shared/models/constants';
import { MoneyPipe, SmDatePipe } from '../../shared/pipes/format.pipes';
import { AutomationsApi } from './automations.api';

@Component({
  selector: 'sm-automations-page',
  imports: [PageHeaderComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent, TuiIcon, TuiSwitch, MoneyPipe, SmDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sm-page-header title="Automations" subtitle="Salary, EMIs, rent, subscriptions and other recurring items. Recorded or reminded - never auto-debited.">
      <button type="button" class="btn btn-primary" (click)="create()" [disabled]="ref.activeAccounts().length === 0">
        <tui-icon icon="@tui.plus" /> New automation
      </button>
    </sm-page-header>

    @if (error()) { <sm-error-state [message]="error()!" (retry)="load()" /> }
    @else if (loading()) { <sm-skeleton height="160px" /> }
    @else {
      @if (pending().length) {
        <section class="card card-pad rise mb-5 border-accent/40" aria-label="Needs your attention">
          <h2 class="m-0 mb-3 flex items-center gap-2 text-base font-semibold"><tui-icon icon="@tui.bell-ring" class="text-accent" /> Needs your attention</h2>
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            @for (e of pending(); track e.id) {
              <li class="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">{{ e.title }}</div>
                  <div class="text-xs text-muted">
                    Due {{ e.scheduledFor | smDate }}
                    @if (e.status === 'FAILED') { · <span class="text-expense">Failed: {{ e.error }}</span> }
                  </div>
                </div>
                <div class="num text-sm font-semibold" [class.text-income]="e.kind === 'INCOME'" [class.text-expense]="e.kind === 'EXPENSE'">{{ e.amount | money }}</div>
                <div class="flex gap-2">
                  <button type="button" class="btn btn-sm btn-primary" (click)="confirm(e)">{{ e.status === 'FAILED' ? 'Retry' : 'Confirm' }}</button>
                  <button type="button" class="btn btn-sm" (click)="skip(e)">Skip</button>
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (items().length === 0) {
        <div class="card"><sm-empty-state icon="@tui.repeat" title="No automations yet"
          hint="Add your salary, rent or EMI once and SManager AI will record it or remind you each time."
          actionLabel="New automation" (action)="create()" /></div>
      } @else {
        <div class="grid gap-3 lg:grid-cols-[1fr_340px]">
          <div class="flex flex-col gap-3">
            @for (a of items(); track a.id) {
              <article class="card card-pad rise" [class.opacity-60]="!a.isEnabled">
                <div class="flex items-start gap-3">
                  <span class="grid size-11 shrink-0 place-items-center rounded-xl"
                    [style.background]="a.kind === 'INCOME' ? 'var(--income-soft)' : 'var(--expense-soft)'"
                    [style.color]="a.kind === 'INCOME' ? 'var(--income)' : 'var(--expense)'"><tui-icon icon="@tui.repeat" /></span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="m-0 truncate text-base font-semibold">{{ a.title }}</h3>
                      <span class="chip">{{ a.mode === 'AUTO' ? 'Automatic' : 'Reminder' }}</span>
                      @if (!a.isEnabled) { <span class="chip">Paused</span> }
                      @if (a.finished) { <span class="chip">Finished</span> }
                    </div>
                    <div class="mt-1 text-xs text-muted">
                      {{ freq(a) }} · {{ a.accountName }}@if (a.categoryName) { · {{ a.categoryName }} }
                    </div>
                    <div class="mt-1 text-xs text-muted">
                      @if (a.nextRunDate && a.isEnabled) { Next: <b class="text-fg">{{ a.nextRunDate | smDate }}</b> }
                      @else if (!a.isEnabled) { Paused – no entries are created }
                      @else { No more occurrences }
                      @if (a.endDate) { · ends {{ a.endDate | smDate }} }
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="num text-lg font-semibold" [class.text-income]="a.kind === 'INCOME'" [class.text-expense]="a.kind === 'EXPENSE'">{{ a.amount | money }}</div>
                    <div class="num text-xs text-muted">≈ {{ a.monthlyEquivalent | money }}/mo</div>
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <label class="flex cursor-pointer items-center gap-2 text-xs text-muted">
                    <input type="checkbox" tuiSwitch size="s" [checked]="a.isEnabled" (change)="toggle(a, $any($event.target).checked)" [attr.aria-label]="'Enable ' + a.title" />
                    {{ a.isEnabled ? 'Enabled' : 'Paused' }}
                  </label>
                  <span class="flex-1"></span>
                  <button type="button" class="btn btn-sm" (click)="history(a)">History</button>
                  <button type="button" class="btn btn-sm" (click)="edit(a)">Edit</button>
                  <button type="button" class="btn-ghost" [attr.aria-label]="'Delete ' + a.title" (click)="remove(a)"><tui-icon icon="@tui.trash" /></button>
                </div>
                @if (historyFor() === a.id) {
                  <ul class="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-xs">
                    @for (e of executions(); track e.id) {
                      <li class="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                        <span>{{ e.scheduledFor | smDate }}</span>
                        <span class="num">{{ e.amount | money }}</span>
                        <span [class.text-income]="e.status === 'SUCCESS'" [class.text-expense]="e.status === 'FAILED'" [class.text-warn]="e.status === 'PENDING'">{{ statusLabel(e) }}</span>
                      </li>
                    } @empty { <li class="text-muted">Nothing has run yet.</li> }
                  </ul>
                }
              </article>
            }
          </div>

          <aside class="card card-pad h-fit" aria-label="Upcoming">
            <h2 class="m-0 mb-3 text-base font-semibold">Upcoming · 60 days</h2>
            @if (upcoming().length === 0) { <p class="m-0 text-sm text-muted">Nothing scheduled.</p> }
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
              @for (u of upcoming(); track u.automationId + u.date) {
                <li class="flex items-center gap-3 text-sm">
                  <span class="w-16 shrink-0 text-xs text-muted">{{ u.date | smDate }}</span>
                  <span class="min-w-0 flex-1 truncate">{{ u.title }}</span>
                  <span class="num text-xs font-semibold" [class.text-income]="u.kind === 'INCOME'" [class.text-expense]="u.kind === 'EXPENSE'">{{ u.amount | money }}</span>
                </li>
              }
            </ul>
          </aside>
        </div>
      }
    }
  `,
})
export class AutomationsPage {
  protected readonly ref = inject(RefData);
  private readonly dialogs = inject(Dialogs);
  private readonly api = inject(AutomationsApi);
  private readonly toast = inject(Toast);
  private readonly confirmSvc = inject(ConfirmService);

  protected readonly items = signal<Automation[]>([]);
  protected readonly pending = signal<Execution[]>([]);
  protected readonly upcoming = signal<UpcomingItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly historyFor = signal<string | null>(null);
  protected readonly executions = signal<Execution[]>([]);

  constructor() { this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set(null);
    let left = 3;
    const done = () => { if (--left === 0) this.loading.set(false); };
    const fail = (e: Error) => { this.error.set(e.message); this.loading.set(false); };
    this.api.list().subscribe({ next: (v) => { this.items.set(v); done(); }, error: fail });
    this.api.pending().subscribe({ next: (v) => { this.pending.set(v); done(); }, error: fail });
    this.api.upcoming(60).subscribe({ next: (v) => { this.upcoming.set(v); done(); }, error: fail });
    this.ref.refreshNotifications().subscribe();
  }

  protected freq(a: Automation): string { return frequencyLabel(a.frequency, a.customEvery, a.customUnit); }
  protected statusLabel(e: Execution): string {
    return ({ SUCCESS: 'Recorded', FAILED: 'Failed', PENDING: 'Awaiting confirmation', SKIPPED: 'Skipped' } as const)[e.status];
  }

  protected async create(): Promise<void> { if (await this.dialogs.automation()) this.load(); }
  protected async edit(a: Automation): Promise<void> { if (await this.dialogs.automation(a)) this.load(); }

  protected toggle(a: Automation, enabled: boolean): void {
    this.api.update(a.id, { isEnabled: enabled }).subscribe({
      next: () => { this.toast.success(enabled ? 'Automation resumed' : 'Automation paused'); this.load(); },
      error: (e) => { this.toast.error(e); this.load(); },
    });
  }

  protected history(a: Automation): void {
    if (this.historyFor() === a.id) { this.historyFor.set(null); return; }
    this.historyFor.set(a.id);
    this.api.executions(a.id).subscribe({ next: (v) => this.executions.set(v), error: (e) => this.toast.error(e) });
  }

  protected confirm(e: Execution): void {
    this.api.confirm(e.id).subscribe({
      next: () => { this.toast.success('Recorded'); this.load(); void this.ref.loadAll().subscribe(); },
      error: (err) => this.toast.error(err),
    });
  }
  protected skip(e: Execution): void {
    this.api.skip(e.id).subscribe({ next: () => { this.toast.info('Skipped'); this.load(); }, error: (err) => this.toast.error(err) });
  }

  protected async remove(a: Automation): Promise<void> {
    if (!(await this.confirmSvc.ask({
      title: `Delete “${a.title}”?`,
      message: 'Future occurrences stop. Transactions already recorded are kept.',
      confirmLabel: 'Delete', danger: true,
    }))) return;
    this.api.remove(a.id).subscribe({ next: () => { this.toast.success('Automation deleted'); this.load(); }, error: (e) => this.toast.error(e) });
  }
}
