import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { Dialogs } from '../../core/services/dialogs.service';
import { ApiError } from '../../core/api/api.client';
import { Toast } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent, ErrorStateComponent, PageHeaderComponent } from '../../shared/components/ui.components';
import { Account, Adjustment, Transaction, TransactionPage } from '../../shared/models/api.models';
import { accountTypeLabel } from '../../shared/models/constants';
import { MoneyPipe, SmDatePipe } from '../../shared/pipes/format.pipes';
import { TransactionListComponent } from '../transactions/transaction-list.component';
import { TransactionsApi } from '../transactions/transactions.api';
import { AccountsApi } from './accounts.api';

@Component({
  selector: 'sm-account-detail-page',
  imports: [PageHeaderComponent, TransactionListComponent, EmptyStateComponent, ErrorStateComponent, MoneyPipe, SmDatePipe, TuiIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) {
      <sm-error-state [message]="error()!" (retry)="load()" />
    } @else if (account(); as a) {
      <a routerLink="/accounts" class="mb-2 inline-flex items-center gap-1 text-sm text-muted no-underline hover:text-fg"><tui-icon icon="@tui.chevron-left" /> Accounts</a>
      <sm-page-header [title]="a.name" [subtitle]="typeLabel(a.type) + (a.institution ? ' · ' + a.institution : '')">
        <button type="button" class="btn" (click)="edit(a)">Edit</button>
        <button type="button" class="btn" (click)="dialogs.adjust(a).then(reload)" [disabled]="!a.isActive">Correct balance</button>
        <button type="button" class="btn" (click)="dialogs.transfer({ fromAccountId: a.id }).then(reload)" [disabled]="!a.isActive">Transfer</button>
        <button type="button" class="btn btn-primary" (click)="dialogs.transaction({ accountId: a.id }).then(reload)" [disabled]="!a.isActive">
          <tui-icon icon="@tui.plus" /> Add
        </button>
      </sm-page-header>

      <div class="card card-pad rise mb-5">
        <div class="field-label">{{ a.type === 'CREDIT_CARD' ? 'Outstanding amount' : 'Current balance' }}</div>
        <div class="num mt-1 text-3xl font-semibold text-balance">{{ (a.type === 'CREDIT_CARD' ? -a.balance : a.balance) | money }}</div>
        <div class="mt-1 text-xs text-muted">Opened {{ a.openingDate | smDate }} with {{ (a.type === 'CREDIT_CARD' ? -a.openingBalance : a.openingBalance) | money }}</div>
      </div>

      <div class="seg mb-3" role="tablist">
        <button type="button" role="tab" [attr.aria-pressed]="tab() === 'tx'" (click)="tab.set('tx')">Transactions</button>
        <button type="button" role="tab" [attr.aria-pressed]="tab() === 'adj'" (click)="tab.set('adj')">Adjustments</button>
      </div>

      @if (tab() === 'tx') {
        <div class="card overflow-hidden">
          @if (page(); as p) {
            @if (p.items.length === 0) { <sm-empty-state icon="@tui.arrow-left-right" title="No transactions yet" hint="Transactions on this account will show up here." /> }
            @else {
              <sm-transaction-list [items]="p.items" [dailyTotals]="p.dailyTotals" [showAccount]="false" (select)="open($event)" />
              <div class="flex items-center justify-between gap-2 border-t border-line p-3 text-sm text-muted">
                <span>{{ p.items.length }} of {{ p.total }}</span>
                @if (p.items.length < p.total) { <button type="button" class="btn btn-sm" (click)="more()">Load more</button> }
              </div>
            }
          }
        </div>
      } @else {
        <div class="card overflow-hidden">
          @if (adjustments().length === 0) {
            <sm-empty-state icon="@tui.scale" title="No adjustments" hint="Manual balance corrections appear here, separate from real transactions." />
          } @else {
            <ul class="m-0 list-none p-0">
              @for (j of adjustments(); track j.id) {
                <li class="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <span class="grid size-10 place-items-center rounded-xl bg-balance-soft text-balance"><tui-icon icon="@tui.scale" /></span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium">{{ j.reason }}</div>
                    <div class="text-xs text-muted">Adjustment · effective {{ j.effectiveAt | smDate }}</div>
                  </div>
                  <div class="num text-sm font-semibold" [class.text-income]="j.amount > 0" [class.text-expense]="j.amount < 0">{{ j.amount | money: 'sign' }}</div>
                  <button type="button" class="btn-ghost" aria-label="Delete adjustment" (click)="removeAdj(j)"><tui-icon icon="@tui.trash" /></button>
                </li>
              }
            </ul>
          }
        </div>
      }
    }
  `,
})
export class AccountDetailPage {
  readonly id = input.required<string>();
  protected readonly dialogs = inject(Dialogs);
  private readonly api = inject(AccountsApi);
  private readonly txApi = inject(TransactionsApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(ConfirmService);

  protected readonly account = signal<Account | null>(null);
  protected readonly page = signal<TransactionPage | null>(null);
  protected readonly adjustments = signal<Adjustment[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly tab = signal<'tx' | 'adj'>('tx');
  protected readonly typeLabel = accountTypeLabel;

  constructor() { effect(() => { this.id(); untracked(() => this.load()); }); }

  protected load(): void {
    this.error.set(null);
    this.api.get(this.id()).subscribe({
      next: (a) => this.account.set(a),
      error: (e: ApiError) => this.error.set(e.status === 404 ? 'Account not found.' : e.message),
    });
    this.txApi.list({ accountId: this.id(), pageSize: 30, page: 1 }).subscribe({ next: (p) => this.page.set(p), error: (e) => this.toast.error(e) });
    this.api.adjustments(this.id()).subscribe({ next: (a) => this.adjustments.set(a) });
  }
  protected reload = () => this.load();

  protected more(): void {
    const p = this.page();
    if (!p) return;
    this.txApi.list({ accountId: this.id(), pageSize: 30, page: p.page + 1 }).subscribe({
      next: (n) => this.page.set({ ...n, items: [...p.items, ...n.items], dailyTotals: { ...p.dailyTotals, ...n.dailyTotals } }),
      error: (e) => this.toast.error(e),
    });
  }

  protected open(t: Transaction): void { void this.dialogs.editTransaction(t).then(this.reload); }
  protected edit(a: Account): void { void this.dialogs.account(a).then(this.reload); }

  protected async removeAdj(j: Adjustment): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Delete adjustment?', message: 'The balance will change back by this amount.', confirmLabel: 'Delete', danger: true }))) return;
    this.api.removeAdjustment(this.id(), j.id).subscribe({
      next: () => { this.toast.success('Adjustment removed'); this.load(); },
      error: (e) => this.toast.error(e),
    });
  }
}
