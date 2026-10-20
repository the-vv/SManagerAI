import { ChangeDetectionStrategy, Component, inject, input, signal, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TuiIcon, tuiDialog } from '@taiga-ui/core';
import { TuiSwitch } from '@taiga-ui/kit';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { Toast } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent, PageHeaderComponent } from '../../shared/components/ui.components';
import { EventExpense, Person, TrackEventDetail, Transaction, TransactionPage } from '../../shared/models/api.models';
import { MoneyPipe } from '../../shared/pipes/format.pipes';
import { AuthService } from '../../core/auth/auth.service';
import { EventExpenseDialog } from './event-expense.dialog';
import { TransactionListComponent } from '../transactions/transaction-list.component';

@Component({
  selector: 'sm-event-detail-page',
  imports: [PageHeaderComponent, EmptyStateComponent, TransactionListComponent, TuiIcon, TuiSwitch, RouterLink, MoneyPipe],
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

      <section class="card card-pad mb-4" aria-label="Sharing">
        <h2 class="m-0 mb-1 text-base font-semibold">Share this event</h2>
        <p class="m-0 mb-3 text-sm text-muted">Anyone with the link can see the shares and who owes what. They never see your accounts or transactions.</p>
        <label class="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
          Public link
          <input type="checkbox" tuiSwitch [checked]="e.shareEnabled" (change)="setSharing({ enabled: $any($event.target).checked })" />
        </label>
        @if (e.shareEnabled) {
          @if (shareLink(e); as l) {
            <div class="mt-3 flex items-center gap-2">
              <input class="input !min-h-10 min-w-0 flex-1 !text-xs" readonly aria-label="Public link" [value]="l" (focus)="$any($event.target).select()" />
              <button type="button" class="btn btn-sm" (click)="copy(l)"><tui-icon icon="@tui.copy" /> Copy</button>
            </div>
          }
          <label class="mt-3 flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
            <span>Let people with the link add their own expenses<span class="block text-xs font-normal text-muted">They are added as participants and shown with a “link” tag.</span></span>
            <input type="checkbox" tuiSwitch [checked]="e.allowGuestExpenses" (change)="setSharing({ allowGuestExpenses: $any($event.target).checked })" />
          </label>
          <button type="button" class="btn btn-sm mt-3" (click)="rotate()">Create a new link (old one stops working)</button>
        }
      </section>

      <section class="card card-pad mb-4" aria-label="People and shares">
        <div class="mb-1 flex items-center justify-between gap-3">
          <h2 class="m-0 text-base font-semibold">People &amp; shares</h2>
          <button type="button" class="btn btn-sm" (click)="addExpense()"><tui-icon icon="@tui.plus" /> Expense by someone else</button>
        </div>
        <p class="m-0 mb-3 text-sm text-muted">
          Total cost <span class="num font-medium text-fg">{{ e.totalCost | money }}</span> (yours plus what others paid), split equally between {{ e.members.length }}.
          Others’ expenses are not part of your accounts.
        </p>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          @for (m of e.members; track m.personId) {
            <li class="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{{ m.name }}</div>
                <div class="num text-xs text-muted">Spent {{ m.spent | money }} · Share {{ m.share | money }}</div>
              </div>
              <div class="num text-right text-sm font-semibold" [class.text-income]="m.balance > 0" [class.text-expense]="m.balance < 0">
                {{ m.balance > 0 ? 'Gets back ' + (m.balance | money) : m.balance < 0 ? 'Owes ' + (-m.balance | money) : 'Settled' }}
              </div>
              @if (m.personId && !hasExpenses(m.personId)) {
                <button type="button" class="btn-ghost" [attr.aria-label]="'Remove ' + m.name" (click)="removePerson(m.personId)"><tui-icon icon="@tui.x" /></button>
              }
            </li>
          }
        </ul>
        <div class="mt-3 flex gap-2">
          <input class="input !min-h-10 min-w-0 flex-1" maxlength="60" placeholder="Add a person to this event" aria-label="Person name" list="sm-people-list"
            [value]="newPerson()" (input)="newPerson.set($any($event.target).value)" (keydown.enter)="addPerson(); $event.preventDefault()" />
          <datalist id="sm-people-list">@for (p of people(); track p.id) { <option [value]="p.name"></option> }</datalist>
          <button type="button" class="btn btn-sm" [disabled]="!newPerson().trim()" (click)="addPerson()">Add</button>
        </div>

        @if (e.expenses.length > 0) {
          <h3 class="m-0 mt-4 mb-2 text-sm font-semibold">Expenses by others</h3>
          <ul class="m-0 flex list-none flex-col p-0">
            @for (x of e.expenses; track x.id) {
              <li>
                <button type="button" class="flex w-full cursor-pointer items-center gap-3 border-0 border-b border-line bg-transparent px-1 py-2.5 text-left text-fg" (click)="editExpense(x)">
                  <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ x.title }}</span><span class="text-xs text-muted">{{ x.person.name }}@if (x.addedByGuest) { · via link }</span></span>
                  <span class="num text-sm font-semibold">{{ x.amount | money }}</span>
                </button>
              </li>
            }
          </ul>
        }
      </section>

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
  private readonly auth = inject(AuthService);
  protected readonly dialogs = inject(Dialogs);

  protected readonly ev = signal<TrackEventDetail | null>(null);
  protected readonly txs = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  protected readonly people = signal<Person[]>([]);
  protected readonly newPerson = signal('');
  private readonly expenseDialog = tuiDialog(EventExpenseDialog, { size: 's', closable: true, dismissible: true });
  private page = 1;

  constructor() { effect(() => { this.id(); this.reload(); }); }

  protected readonly reload = (): void => {
    this.page = 1;
    this.api.get<TrackEventDetail>(`/events/${this.id()}`).subscribe({ next: (e) => this.ev.set(e), error: (e) => { this.toast.error(e); void this.router.navigateByUrl('/events'); } });
    this.fetch();
    this.api.get<Person[]>('/people').subscribe({ next: (p) => this.people.set(p) });
  };

  private fetch(): void {
    this.api.get<TransactionPage>('/transactions', { eventId: this.id(), page: this.page, pageSize: 50 }).subscribe({
      next: (p) => { this.txs.set(this.page === 1 ? p.items : [...this.txs(), ...p.items]); this.total.set(p.total); },
      error: (e) => this.toast.error(e),
    });
  }

  /** The Android app has no public web address, so it cannot build a link. */
  protected shareLink(e: TrackEventDetail): string | null {
    return this.auth.isNative || !e.shareToken ? null : `${window.location.origin}/e/${encodeURIComponent(e.shareToken)}`;
  }

  protected setSharing(body: { enabled?: boolean; allowGuestExpenses?: boolean; regenerate?: boolean }): void {
    this.api.patch(`/events/${this.id()}/sharing`, body).subscribe({ next: this.reload, error: (e) => { this.toast.error(e); this.reload(); } });
  }

  protected async rotate(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Create a new link?', message: 'The current link will stop working for everyone who has it.', confirmLabel: 'Create new link' }))) return;
    this.setSharing({ regenerate: true });
  }

  protected async copy(text: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); this.toast.success('Link copied'); }
    catch { this.toast.info('Select the link and copy it manually.'); }
  }

  protected hasExpenses(personId: string): boolean { return !!this.ev()?.expenses.some((x) => x.person.id === personId); }

  protected addExpense(): void { this.openExpense(); }
  protected editExpense(expense: EventExpense): void { this.openExpense(expense); }
  private openExpense(expense?: EventExpense): void {
    void firstValueFrom(this.expenseDialog({ eventId: this.id(), people: this.people(), expense }), { defaultValue: false }).then(this.reload);
  }

  protected addPerson(): void {
    const name = this.newPerson().trim();
    if (!name) return;
    this.api.post(`/events/${this.id()}/people`, { name }).subscribe({ next: () => { this.newPerson.set(''); this.reload(); }, error: (e) => this.toast.error(e) });
  }

  protected removePerson(personId: string): void {
    this.api.delete(`/events/${this.id()}/people/${personId}`).subscribe({ next: this.reload, error: (e) => this.toast.error(e) });
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
