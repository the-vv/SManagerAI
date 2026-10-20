import { ChangeDetectionStrategy, Component, inject, input, signal, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { ApiClient } from '../../core/api/api.client';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { Toast } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent, PageHeaderComponent } from '../../shared/components/ui.components';
import { TrackEventDetail, Transaction, TransactionPage } from '../../shared/models/api.models';
import { MoneyPipe } from '../../shared/pipes/format.pipes';
import { TransactionListComponent } from '../transactions/transaction-list.component';

@Component({
  selector: 'sm-event-detail-page',
  imports: [PageHeaderComponent, EmptyStateComponent, TransactionListComponent, TuiIcon, RouterLink, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/events" class="mb-2 inline-flex items-center gap-1 text-sm text-muted no-underline"><tui-icon icon="@tui.chevron-left" /> All events</a>
    @if (ev(); as e) {
      <sm-page-header [title]="e.name" [subtitle]="subtitle(e)">
        <button type="button" class="btn btn-primary" (click)="add()" [disabled]="!e.isActive"><tui-icon icon="@tui.plus" /> Add transaction</button>
        <button type="button" class="btn" (click)="edit(e)">Edit</button>
        <button type="button" class="btn" (click)="toggle(e)">{{ e.isActive ? 'Close' : 'Reopen' }}</button>
        <button type="button" class="btn-ghost" aria-label="Delete event" (click)="remove(e)"><tui-icon icon="@tui.trash" /></button>
      </sm-page-header>

      <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="card card-pad"><div class="text-xs text-muted">Spent</div><div class="num text-xl font-semibold text-expense">{{ e.expense | money }}</div></div>
        <div class="card card-pad"><div class="text-xs text-muted">Income</div><div class="num text-xl font-semibold text-income">{{ e.income | money }}</div></div>
        <div class="card card-pad"><div class="text-xs text-muted">Transactions</div><div class="num text-xl font-semibold">{{ e.count }}</div></div>
        <div class="card card-pad">
          <div class="text-xs text-muted">{{ e.budget ? (e.expense > e.budget ? 'Over budget' : 'Budget left') : 'Budget' }}</div>
          <div class="num text-xl font-semibold" [class.text-expense]="!!e.budget && e.expense > e.budget">{{ e.budget ? ((e.expense > e.budget ? e.expense - e.budget : e.budget - e.expense) | money) : 'Not set' }}</div>
        </div>
      </div>

      @if (e.categories.length > 0) {
        <section class="card card-pad mb-4" aria-label="Spending by category">
          <h2 class="m-0 mb-3 text-base font-semibold">Where it went</h2>
          <ul class="m-0 flex list-none flex-col gap-3 p-0">
            @for (c of e.categories; track c.categoryId) {
              <li>
                <div class="flex items-baseline justify-between gap-3 text-sm"><span class="truncate">{{ c.name }}</span><span class="num">{{ c.total | money }}</span></div>
                <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div class="h-full rounded-full" [style.width.%]="e.expense ? (c.total / e.expense) * 100 : 0" [style.background]="c.color ?? 'var(--accent)'"></div>
                </div>
              </li>
            }
          </ul>
        </section>
      }

      <div class="card overflow-hidden">
        @if (txs().length === 0) {
          <sm-empty-state icon="@tui.arrow-left-right" title="Nothing here yet" hint="Pick this event when adding a transaction, or edit an existing one to tag it." />
        } @else {
          <sm-transaction-list [items]="txs()" [grouped]="false" (select)="open($event)" />
          @if (txs().length < total()) {
            <div class="flex items-center justify-between gap-2 border-t border-line p-3 text-sm text-muted">
              <span>{{ txs().length }} of {{ total() }}</span><button type="button" class="btn btn-sm" (click)="more()">Load more</button>
            </div>
          }
        }
      </div>
    }
  `,
})
export class EventDetailPage {
  readonly id = input.required<string>();
  private readonly api = inject(ApiClient);
  private readonly ref = inject(RefData);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(ConfirmService);
  protected readonly dialogs = inject(Dialogs);

  protected readonly ev = signal<TrackEventDetail | null>(null);
  protected readonly txs = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  private page = 1;

  constructor() { effect(() => { this.id(); this.reload(); }); }

  protected readonly reload = (): void => {
    this.page = 1;
    this.api.get<TrackEventDetail>(`/events/${this.id()}`).subscribe({ next: (e) => this.ev.set(e), error: (e) => { this.toast.error(e); void this.router.navigateByUrl('/events'); } });
    this.fetch();
  };

  private fetch(): void {
    this.api.get<TransactionPage>('/transactions', { eventId: this.id(), page: this.page, pageSize: 50 }).subscribe({
      next: (p) => { this.txs.set(this.page === 1 ? p.items : [...this.txs(), ...p.items]); this.total.set(p.total); },
      error: (e) => this.toast.error(e),
    });
  }

  protected more(): void { this.page++; this.fetch(); }
  protected add(): void { void this.dialogs.transaction({ eventId: this.id() }).then(this.reload); }
  protected open(t: Transaction): void { void this.dialogs.editTransaction(t).then(this.reload); }
  protected edit(e: TrackEventDetail): void { void this.dialogs.event(e).then(this.reload); }

  protected subtitle(e: TrackEventDetail): string {
    return [e.startDate && e.endDate ? `${e.startDate} → ${e.endDate}` : e.startDate ?? e.endDate, e.notes].filter(Boolean).join(' · ') || 'Everything tagged with this event.';
  }

  protected toggle(e: TrackEventDetail): void {
    this.api.patch(`/events/${e.id}`, { isActive: !e.isActive }).subscribe({
      next: () => { this.ref.refreshEvents().subscribe(); this.reload(); }, error: (er) => this.toast.error(er),
    });
  }

  protected async remove(e: TrackEventDetail): Promise<void> {
    if (!(await this.confirm.ask({ title: `Delete “${e.name}”?`, message: 'Its transactions are kept; they just stop belonging to this event.', confirmLabel: 'Delete', danger: true }))) return;
    this.api.delete(`/events/${e.id}`).subscribe({
      next: () => { this.toast.success('Event deleted'); this.ref.refreshEvents().subscribe(); void this.router.navigateByUrl('/events'); },
      error: (er) => this.toast.error(er),
    });
  }
}
