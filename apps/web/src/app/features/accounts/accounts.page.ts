import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { Toast } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent, PageHeaderComponent, SkeletonComponent } from '../../shared/components/ui.components';
import { Account } from '../../shared/models/api.models';
import { accountTypeIcon, accountTypeLabel } from '../../shared/models/constants';
import { MoneyPipe } from '../../shared/pipes/format.pipes';
import { AccountsApi } from './accounts.api';
import { AccountsOverview } from '../../shared/models/api.models';
import { DateInputComponent } from '../../shared/components/date-input.component';

@Component({
  selector: 'sm-accounts-page',
  imports: [PageHeaderComponent, EmptyStateComponent, SkeletonComponent, TuiIcon, MoneyPipe, RouterLink, DateInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sm-page-header title="Accounts" subtitle="Balances are derived from opening balance, transactions, transfers and adjustments.">
      <button type="button" class="btn" (click)="dialogs.transfer()" [disabled]="ref.activeAccounts().length < 2">
        <tui-icon icon="@tui.arrow-left-right" /> Transfer
      </button>
      <button type="button" class="btn btn-primary" (click)="dialogs.account()"><tui-icon icon="@tui.plus" /> New account</button>
    </sm-page-header>

    @if (!ref.loaded()) {
      <div class="grid gap-4 sm:grid-cols-3"><sm-skeleton height="96px" /><sm-skeleton height="96px" /><sm-skeleton height="96px" /></div>
    } @else if (ref.accounts().length === 0) {
      <div class="card">
        <sm-empty-state icon="@tui.landmark" title="Add your first account"
          hint="Create a bank account, cash wallet or credit card to start tracking."
          actionLabel="New account" (action)="dialogs.account()" />
      </div>
    } @else {
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <label class="field-label flex items-center gap-2">
          Balances as of
          <sm-date class="w-44" size="s" ariaLabel="Balances as of" [value]="asOf() ?? today" [max]="today" (valueChange)="setDate($event)" />
        </label>
        @if (asOf()) { <button type="button" class="btn btn-sm" (click)="asOf.set(null)">Show current</button> }
      </div>

      <div class="rise mb-5 grid gap-3 sm:grid-cols-3">
        <div class="card card-pad">
          <div class="field-label">Available cash &amp; savings</div>
          <div class="num mt-1 text-2xl font-semibold text-balance">{{ view().totals.available | money }}</div>
          <div class="mt-1 text-xs text-muted">Active bank, savings and cash accounts</div>
        </div>
        <div class="card card-pad">
          <div class="field-label">Credit card dues</div>
          <div class="num mt-1 text-2xl font-semibold" [class.text-expense]="view().totals.creditDue > 0">{{ view().totals.creditDue | money }}</div>
          <div class="mt-1 text-xs text-muted">Owed, not subtracted from available cash</div>
        </div>
        <div class="card card-pad">
          <div class="field-label">Net position</div>
          <div class="num mt-1 text-2xl font-semibold">{{ view().totals.netWorth | money }}</div>
          <div class="mt-1 text-xs text-muted">Available minus card dues</div>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        @for (a of view().items; track a.id) {
          <article class="card card-pad rise flex flex-col gap-3" [class.opacity-60]="!a.isActive">
            <div class="flex items-start gap-3">
              <span class="grid size-11 shrink-0 place-items-center rounded-xl text-lg"
                [style.background]="a.color ? 'color-mix(in srgb,' + a.color + ' 20%, transparent)' : 'var(--accent-soft)'"
                [style.color]="a.color ?? 'var(--accent)'">
                <tui-icon [icon]="'@tui.' + (a.icon ?? typeIcon(a.type))" />
              </span>
              <div class="min-w-0 flex-1">
                <a [routerLink]="['/accounts', a.id]" class="block truncate text-base font-semibold text-fg no-underline hover:underline">{{ a.name }}</a>
                <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span>{{ typeLabel(a.type) }}</span>
                  @if (a.institution) { <span>· {{ a.institution }}</span> }
                  @if (a.identifier) { <span>· ••{{ a.identifier }}</span> }
                </div>
              </div>
              <div class="flex flex-col items-end gap-1">
                @if (a.isDefault) { <span class="chip text-accent">Default</span> }
                @if (!a.isActive) { <span class="chip">Inactive</span> }
              </div>
            </div>
            <div>
              <div class="field-label">{{ a.type === 'CREDIT_CARD' ? 'Outstanding' : 'Balance' }}</div>
              <div class="num text-2xl font-semibold" [class.text-expense]="a.balance < 0 && a.type !== 'CREDIT_CARD'">
                {{ (a.type === 'CREDIT_CARD' ? -a.balance : a.balance) | money }}
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <a class="btn btn-sm no-underline" [routerLink]="['/accounts', a.id]">History</a>
              <button type="button" class="btn btn-sm" (click)="dialogs.account(a)">Edit</button>
              <button type="button" class="btn btn-sm" (click)="dialogs.adjust(a)" [disabled]="!a.isActive">Correct balance</button>
              @if (a.isActive && !a.isDefault) { <button type="button" class="btn btn-sm" (click)="makeDefault(a)">Make default</button> }
              @if (a.isActive) { <button type="button" class="btn btn-sm" (click)="toggleActive(a)">Deactivate</button> }
              @else { <button type="button" class="btn btn-sm" (click)="toggleActive(a)">Reactivate</button> }
            </div>
          </article>
        }
      </div>
    }
  `,
})
export class AccountsPage {
  protected readonly ref = inject(RefData);
  protected readonly dialogs = inject(Dialogs);
  private readonly api = inject(AccountsApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(ConfirmService);
  protected readonly today = inject(SettingsStore).today();

  protected readonly asOf = signal<string | null>(null);
  private readonly historic = signal<AccountsOverview | null>(null);
  protected readonly view = computed(() => (this.asOf() && this.historic()) ? this.historic()! : this.ref.overview()!);
  protected readonly typeLabel = accountTypeLabel;
  protected readonly typeIcon = accountTypeIcon;

  protected setDate(d: string): void {
    if (!d || d >= this.today) { this.asOf.set(null); return; }
    this.api.overview(d).subscribe({ next: (o) => { this.historic.set(o); this.asOf.set(d); }, error: (e) => this.toast.error(e) });
  }

  protected makeDefault(a: Account): void {
    this.api.setDefault(a.id).subscribe({
      next: () => { this.toast.success(`${a.name} is now the default account`); this.ref.refreshAccounts().subscribe(); },
      error: (e) => this.toast.error(e),
    });
  }

  protected async toggleActive(a: Account): Promise<void> {
    if (a.isActive && !(await this.confirm.ask({
      title: `Deactivate ${a.name}?`,
      message: 'History is kept. The account stops accepting new transactions and is left out of combined balances.',
      confirmLabel: 'Deactivate', danger: true,
    }))) return;
    this.api.update(a.id, { isActive: !a.isActive }).subscribe({
      next: () => { this.toast.success(a.isActive ? 'Account deactivated' : 'Account reactivated'); this.ref.refreshAccounts().subscribe(); },
      error: (e) => this.toast.error(e),
    });
  }
}

