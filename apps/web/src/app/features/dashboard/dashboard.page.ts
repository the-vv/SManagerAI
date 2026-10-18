import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { ApiClient } from '../../core/api/api.client';
import { monthLabel } from '../../core/format/datetime';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { ChartComponent } from '../../shared/components/chart.component';
import { colorFor, donutOption, trendOption } from '../../shared/components/charts';
import { SelectComponent, SelectOption } from '../../shared/components/select.component';
import { MonthNavComponent } from '../../shared/components/month-nav.component';
import { DotComponent, EmptyStateComponent, ErrorStateComponent, PageHeaderComponent, SkeletonComponent } from '../../shared/components/ui.components';
import { Dashboard, Transaction } from '../../shared/models/api.models';
import { MoneyPipe, PercentBpPipe, SmDatePipe } from '../../shared/pipes/format.pipes';
import { AiQueueComponent } from '../ai/ai-queue.component';
import { SmartEntryComponent } from '../ai/smart-entry.component';
import { TransactionListComponent } from '../transactions/transaction-list.component';

@Component({
  selector: 'sm-dashboard-page',
  imports: [
    PageHeaderComponent, MonthNavComponent, ChartComponent, TransactionListComponent, EmptyStateComponent, ErrorStateComponent,
    SkeletonComponent, DotComponent, MoneyPipe, SmDatePipe, PercentBpPipe, TuiIcon, RouterLink, SmartEntryComponent, AiQueueComponent, SelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sm-page-header title="Dashboard" [subtitle]="subtitle()">
      <button type="button" class="btn relative !px-3" aria-controls="dash-filters" [attr.aria-expanded]="filtersOpen()"
        [attr.aria-label]="filtersActive() ? 'Filters (active)' : 'Filters'" title="Account and month filters" (click)="filtersOpen.set(!filtersOpen())">
        <tui-icon icon="@tui.sliders-horizontal" /><span class="hidden sm:inline">Filters</span>
        @if (filtersActive()) { <span class="absolute -top-1 -right-1 size-2.5 rounded-full bg-accent ring-2 ring-[var(--page)]" aria-hidden="true"></span> }
      </button>
    </sm-page-header>

    @if (filtersOpen()) {
      <section id="dash-filters" class="card mb-4 flex flex-wrap items-center gap-2 p-3" aria-label="Dashboard filters">
        <sm-select class="min-w-0 basis-full min-[480px]:flex-[2] min-[480px]:basis-0 sm:w-52 sm:flex-none" size="m" ariaLabel="Account filter" [options]="accountOptions()"
          [value]="accountId()" (valueChange)="accountId.set($event ?? '')" />
        <sm-month-nav class="min-w-0 basis-full min-[480px]:flex-[3] min-[480px]:basis-0 sm:flex-none" [month]="month()" (monthChange)="month.set($event)" />
        @if (filtersActive()) { <button type="button" class="btn btn-sm" (click)="resetFilters()"><tui-icon icon="@tui.funnel-x" /> Reset</button> }
      </section>
    }

    <sm-smart-entry />
    <sm-ai-queue />

    @if (error()) {
      <sm-error-state [message]="error()!" (retry)="load()" />
    } @else if (!data()) {
      <div class="grid gap-4 sm:grid-cols-3"><sm-skeleton height="110px" /><sm-skeleton height="110px" /><sm-skeleton height="110px" /></div>
      <div class="mt-4 grid gap-4 lg:grid-cols-2"><sm-skeleton height="300px" /><sm-skeleton height="300px" /></div>
    } @else if (data(); as d) {
      @if (ref.loaded() && ref.accounts().length === 0) {
        <div class="card mb-4"><sm-empty-state icon="@tui.landmark" title="Start by adding an account"
          hint="Add a bank account, wallet or card, then record your first transaction."
          actionLabel="Add account" (action)="dialogs.account()" /></div>
      }

      @if (d.pendingReminders > 0) {
        <a routerLink="/automations" class="card mb-4 flex items-center gap-3 border-accent/40 px-4 py-3 text-fg no-underline">
          <tui-icon icon="@tui.bell-ring" class="text-accent" />
          <span class="flex-1 text-sm"><b>{{ d.pendingReminders }}</b> scheduled {{ d.pendingReminders === 1 ? 'item is' : 'items are' }} waiting for your confirmation.</span>
          <tui-icon icon="@tui.chevron-right" class="text-muted" />
        </a>
      }

      <!-- Month activity -->
      <section aria-label="This month" class="rise">
        <h2 class="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">{{ monthTitle() }} activity</h2>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <div class="card flex items-center justify-between gap-3 px-3.5 py-2.5 sm:block">
            <div class="flex items-center gap-2"><span class="grid size-6 shrink-0 place-items-center rounded-md bg-income-soft text-income"><tui-icon icon="@tui.arrow-down-left" [style.font-size.px]="14" /></span>
              <span class="field-label">Income</span></div>
            <div class="text-right sm:mt-1.5 sm:text-left">
              <div class="num text-lg leading-tight font-semibold text-income sm:text-xl">{{ d.summary.income | money }}</div>
              <div class="text-[11px] text-muted"><span [class.text-income]="d.summary.delta.income >= 0" [class.text-expense]="d.summary.delta.income < 0">{{ d.summary.delta.income | money: 'sign' }}</span> vs last month</div>
            </div>
          </div>
          <div class="card flex items-center justify-between gap-3 px-3.5 py-2.5 sm:block">
            <div class="flex items-center gap-2"><span class="grid size-6 shrink-0 place-items-center rounded-md bg-expense-soft text-expense"><tui-icon icon="@tui.arrow-up-right" [style.font-size.px]="14" /></span>
              <span class="field-label">Expenses</span></div>
            <div class="text-right sm:mt-1.5 sm:text-left">
              <div class="num text-lg leading-tight font-semibold text-expense sm:text-xl">{{ d.summary.expense | money }}</div>
              <div class="text-[11px] text-muted"><span [class.text-expense]="d.summary.delta.expense > 0" [class.text-income]="d.summary.delta.expense <= 0">{{ d.summary.delta.expense | money: 'sign' }}</span> vs last month</div>
            </div>
          </div>
          <div class="card flex items-center justify-between gap-3 px-3.5 py-2.5 sm:block">
            <div class="flex items-center gap-2"><span class="grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent"><tui-icon icon="@tui.arrow-up-down" [style.font-size.px]="14" /></span>
              <span class="field-label">Net movement</span></div>
            <div class="text-right sm:mt-1.5 sm:text-left">
              <div class="num text-lg leading-tight font-semibold sm:text-xl" [class.text-income]="d.summary.net >= 0" [class.text-expense]="d.summary.net < 0">{{ d.summary.net | money: 'sign' }}</div>
              <div class="text-[11px] text-muted">Income − expenses</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Balances -->
      <section aria-label="Balances" class="rise mt-6">
        <h2 class="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Balances right now</h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="card card-pad">
            <div class="field-label">{{ d.currentBalance ? d.currentBalance.name : 'No account' }}{{ accountId() ? '' : ' (default)' }}</div>
            <div class="num mt-2 text-2xl font-semibold text-balance">
              {{ d.currentBalance ? ((d.currentBalance.type === 'CREDIT_CARD' ? -d.currentBalance.balance : d.currentBalance.balance) | money) : '–' }}
            </div>
            <div class="mt-1 text-xs text-muted">{{ d.currentBalance?.type === 'CREDIT_CARD' ? 'Amount owed on this card' : 'Current balance' }}</div>
          </div>
          <div class="card card-pad">
            <div class="field-label">Combined balance</div>
            <div class="num mt-2 text-2xl font-semibold text-balance">{{ d.combined.available | money }}</div>
            <div class="mt-1 text-xs text-muted">Cash, bank &amp; savings (active accounts)</div>
          </div>
          <div class="card card-pad">
            <div class="field-label">Credit card dues</div>
            <div class="num mt-2 text-2xl font-semibold" [class.text-expense]="d.combined.creditDue > 0">{{ d.combined.creditDue | money }}</div>
            <div class="mt-1 text-xs text-muted">Net position {{ d.combined.netWorth | money }}</div>
          </div>
        </div>
      </section>

      <!-- Opening -> closing -->
      <section class="card card-pad rise mt-4" aria-label="Month balance walk">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="m-0 text-base font-semibold">{{ monthTitle() }} balance {{ accountId() ? '' : '(all accounts)' }}</h2>
          <span class="text-xs text-muted">Opening + movement = closing</span>
        </div>
        <dl class="m-0 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <div><dt class="field-label">Opening</dt><dd class="num m-0 mt-1 font-semibold">{{ d.period.opening | money }}</dd></div>
          <div><dt class="field-label">Income</dt><dd class="num m-0 mt-1 font-semibold text-income">{{ d.period.income | money: 'sign' }}</dd></div>
          <div><dt class="field-label">Expenses</dt><dd class="num m-0 mt-1 font-semibold text-expense">−{{ d.period.expense | money }}</dd></div>
          <div><dt class="field-label">Transfers</dt><dd class="num m-0 mt-1 font-semibold">{{ d.period.transfersNet | money: 'sign' }}</dd></div>
          <div><dt class="field-label">Adjustments</dt><dd class="num m-0 mt-1 font-semibold">{{ d.period.adjustments | money: 'sign' }}</dd></div>
          <div><dt class="field-label">Closing</dt><dd class="num m-0 mt-1 font-semibold text-balance">{{ d.period.closing | money }}</dd></div>
        </dl>
      </section>

      <!-- Charts -->
      <div class="rise mt-4 grid gap-4 lg:grid-cols-5">
        <section class="card card-pad lg:col-span-3" aria-label="Income versus expenses">
          <h2 class="m-0 mb-1 text-base font-semibold">Income vs expenses</h2>
          <p class="m-0 mb-2 text-xs text-muted">Last 6 months ending {{ monthTitle() }}</p>
          <sm-chart [build]="trend()" label="Monthly income and expenses" height="280px" />
        </section>
        <section class="card card-pad lg:col-span-2" aria-label="Spending by category">
          <h2 class="m-0 mb-3 text-base font-semibold">Spending by category</h2>
          @if (d.expenseByCategory.items.length === 0) {
            <sm-empty-state icon="@tui.chart-pie" title="No expenses this month" />
          } @else {
            <div class="relative">
              <sm-chart [build]="donut()" label="Expenses by category" height="190px" />
              <div class="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div><div class="field-label">Total</div><div class="num text-lg font-semibold">{{ d.expenseByCategory.total | money }}</div></div>
              </div>
            </div>
            <ul class="m-0 mt-3 flex list-none flex-col gap-2 p-0">
              @for (r of topCategories(); track $index) {
                <li class="flex items-center gap-2 text-sm">
                  <sm-dot [color]="colorOf(r, $index)" />
                  <span class="min-w-0 flex-1 truncate">{{ r.name }}</span>
                  <span class="num text-muted">{{ r.shareBp | pct }}</span>
                  <span class="num w-24 text-right font-medium">{{ r.total | money }}</span>
                </li>
              }
            </ul>
          }
        </section>
      </div>

      <div class="rise mt-4 grid gap-4 lg:grid-cols-5">
        <section class="card overflow-hidden lg:col-span-3" aria-label="Recent transactions">
          <div class="flex items-center justify-between px-4 pt-4"><h2 class="m-0 text-base font-semibold">Recent transactions</h2>
            <a routerLink="/transactions" class="text-sm">View all</a></div>
          @if (d.recentTransactions.length === 0) {
            <sm-empty-state icon="@tui.arrow-left-right" title="No transactions this month" hint="Use the + button to add one." />
          } @else {
            <sm-transaction-list [items]="d.recentTransactions" [grouped]="false" (select)="edit($event)" />
          }
        </section>
        <section class="card card-pad lg:col-span-2" aria-label="Upcoming scheduled transactions">
          <div class="mb-3 flex items-center justify-between"><h2 class="m-0 text-base font-semibold">Upcoming</h2><a routerLink="/automations" class="text-sm">Manage</a></div>
          @if (d.upcoming.length === 0) {
            <p class="m-0 text-sm text-muted">No scheduled transactions in the next 30 days.</p>
          } @else {
            <ul class="m-0 flex list-none flex-col gap-3 p-0">
              @for (u of d.upcoming; track u.automationId + u.date) {
                <li class="flex items-center gap-3">
                  <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"><tui-icon icon="@tui.calendar" /></span>
                  <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ u.title }}</span>
                    <span class="text-xs text-muted">{{ u.date | smDate }} · {{ u.mode === 'AUTO' ? 'Automatic' : 'Reminder' }}</span></span>
                  <span class="num text-sm font-semibold" [class.text-income]="u.kind === 'INCOME'" [class.text-expense]="u.kind === 'EXPENSE'">{{ u.amount | money }}</span>
                </li>
              }
            </ul>
          }
        </section>
      </div>
    }
  `,
})
export class DashboardPage {
  protected readonly ref = inject(RefData);
  protected readonly dialogs = inject(Dialogs);
  private readonly api = inject(ApiClient);
  private readonly settings = inject(SettingsStore);

  protected readonly month = signal(this.settings.thisMonth());
  protected readonly accountId = signal('');
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly filtersOpen = signal(false);
  /** non-default account or month: shown as a dot on the filter button while the panel is closed */
  protected readonly filtersActive = computed(() => this.accountId() !== '' || this.month() !== this.settings.thisMonth());
  protected readonly accountOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'All accounts' }, ...this.ref.accounts().map((a) => ({ value: a.id, label: a.name })),
  ]);
  protected readonly monthTitle = computed(() => monthLabel(this.month()));
  protected readonly subtitle = computed(() =>
    this.accountId() ? (this.ref.accountById(this.accountId())?.name ?? '') : 'All accounts · transfers are not counted as income or expenses');
  protected readonly topCategories = computed(() => (this.data()?.expenseByCategory.items ?? []).slice(0, 6));
  protected readonly trend = computed(() => {
    const pts = this.data()?.trend ?? [];
    return trendOption(pts, (v) => this.settings.money(v), (v) => this.settings.money(v, { compact: true }));
  });
  protected readonly donut = computed(() =>
    donutOption(this.data()?.expenseByCategory.items ?? [], (v) => this.settings.money(v), this.settings.settings().useCategoryColors));

  constructor() {
    effect(() => { this.month(); this.accountId(); untracked(() => this.load()); });
    // refreshing after a quick-add anywhere in the app
    effect(() => { this.ref.overview(); untracked(() => this.loadSilently()); });
  }

  protected colorOf(r: { color: string | null; categoryId: string | null }, i: number): string {
    return colorFor(r, i, this.settings.settings().useCategoryColors);
  }

  protected load(): void {
    this.error.set(null);
    this.fetch();
  }
  private loadSilently(): void { if (this.data()) this.fetch(); }
  private fetch(): void {
    this.api.get<Dashboard>('/dashboard', { month: this.month(), accountId: this.accountId() }).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.error.set(e.message),
    });
  }

  protected resetFilters(): void { this.accountId.set(''); this.month.set(this.settings.thisMonth()); }

  protected edit(t: Transaction): void { void this.dialogs.editTransaction(t); }
}

