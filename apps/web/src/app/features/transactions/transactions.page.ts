import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { lastDayOfMonth } from '../../core/format/datetime';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { Toast } from '../../core/services/toast.service';
import { MonthNavComponent } from '../../shared/components/month-nav.component';
import { EmptyStateComponent, ErrorStateComponent, PageHeaderComponent, SkeletonComponent } from '../../shared/components/ui.components';
import { Transaction, TransactionPage } from '../../shared/models/api.models';
import { MoneyPipe } from '../../shared/pipes/format.pipes';
import { ConfirmService } from '../../shared/components/confirm.service';
import { TransactionListComponent } from './transaction-list.component';
import { TransactionsApi, TxQuery } from './transactions.api';
import { SelectComponent } from '../../shared/components/select.component';
import { DateInputComponent } from '../../shared/components/date-input.component';

type KindFilter = '' | 'INCOME' | 'EXPENSE' | 'TRANSFER';

@Component({
  selector: 'sm-transactions-page',
  imports: [PageHeaderComponent, MonthNavComponent, TransactionListComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent, MoneyPipe, TuiIcon, SelectComponent, DateInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sm-page-header title="Transactions" [subtitle]="subtitle()">
      <button type="button" class="btn !px-3" (click)="exportCsv()" [disabled]="exporting()" aria-label="Export CSV" title="Export CSV">
        <tui-icon icon="@tui.download" /><span class="hidden sm:inline">Export</span>
      </button>
      <button type="button" class="btn !px-3" (click)="dialogs.transfer()" [disabled]="ref.activeAccounts().length < 2" aria-label="Transfer between accounts" title="Transfer">
        <tui-icon icon="@tui.arrow-left-right" /><span class="hidden sm:inline">Transfer</span>
      </button>
      <button type="button" class="btn btn-primary" (click)="add()" aria-label="Add transaction"><tui-icon icon="@tui.plus" /><span class="hidden min-[400px]:inline">Add</span></button>
    </sm-page-header>

    <section class="card mb-4 flex flex-col gap-4 p-4" aria-label="Filters">
      <!-- search + filters toggle -->
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-faint"><tui-icon icon="@tui.search" /></span>
          <input type="search" class="input !pl-10" placeholder="Search…" aria-label="Search" [value]="q()" (input)="onSearch($any($event.target).value)" />
        </div>
        <button type="button" class="btn relative lg:hidden" (click)="filtersOpen.set(!filtersOpen())" [attr.aria-expanded]="filtersOpen()" aria-controls="more-filters">
          <tui-icon icon="@tui.sliders-horizontal" /> Filters
          @if (activeCount() > 0) { <span class="grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{{ activeCount() }}</span> }
        </button>
      </div>

      <!-- period -->
      <div class="flex items-center gap-2">
        @if (mode() === 'month') {
          <sm-month-nav class="min-w-0 flex-1 sm:flex-none" [month]="month()" (monthChange)="month.set($event)" />
        } @else {
          <div class="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <sm-date class="min-w-0 flex-1 sm:w-44 sm:flex-none" ariaLabel="From date" [value]="from()" (valueChange)="from.set($event)" />
            <span class="text-muted">→</span>
            <sm-date class="min-w-0 flex-1 sm:w-44 sm:flex-none" ariaLabel="To date" [value]="to()" (valueChange)="to.set($event)" />
          </div>
        }
        <button type="button" class="btn !px-3" (click)="mode.set(mode() === 'month' ? 'range' : 'month')"
          [attr.aria-label]="mode() === 'month' ? 'Use a custom date range' : 'Back to month view'" [title]="mode() === 'month' ? 'Custom date range' : 'Back to month view'">
          <tui-icon [icon]="mode() === 'month' ? '@tui.calendar' : '@tui.x'" />
          <span class="hidden sm:inline">{{ mode() === 'month' ? 'Custom range' : 'Back to month' }}</span>
        </button>
      </div>

      <!-- type -->
      <div class="seg flex w-full [&>button]:min-w-0 [&>button]:flex-1 [&>button]:!px-2" role="group" aria-label="Type">
        <button type="button" [attr.aria-pressed]="kind() === ''" (click)="kind.set('')">All</button>
        <button type="button" [attr.aria-pressed]="kind() === 'INCOME'" (click)="kind.set('INCOME')">Income</button>
        <button type="button" [attr.aria-pressed]="kind() === 'EXPENSE'" (click)="kind.set('EXPENSE')">Expense</button>
        <button type="button" [attr.aria-pressed]="kind() === 'TRANSFER'" (click)="kind.set('TRANSFER')">Transfers</button>
      </div>

      <!-- advanced (always visible on desktop, collapsible on phones) -->
      <div id="more-filters" [class]="filtersOpen() ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'hidden gap-3 lg:grid lg:grid-cols-4'">
        <label class="flex flex-col gap-1"><span class="field-label">Account</span>
          <sm-select [options]="accountOpts()" [value]="accountId()" (valueChange)="accountId.set($event ?? '')" /></label>
        <label class="flex flex-col gap-1"><span class="field-label">Category</span>
          <sm-select [options]="categoryOpts()" [value]="categoryId()" (valueChange)="categoryId.set($event ?? '')" /></label>
        <label class="flex flex-col gap-1"><span class="field-label">Event / trip</span>
          <sm-select [options]="eventFilterOpts()" [value]="eventId()" (valueChange)="eventId.set($event ?? '')" /></label>
        <label class="flex flex-col gap-1"><span class="field-label">Origin</span>
          <sm-select [options]="originOpts" [value]="origin()" (valueChange)="origin.set($event ?? '')" /></label>
        <label class="flex flex-col gap-1"><span class="field-label">Sort by</span>
          <sm-select [options]="sortOpts" [value]="sort()" (valueChange)="sort.set($event ?? 'date:desc')" /></label>
      </div>
      @if (hasFilters()) {
        <div class="-mt-1 flex justify-end"><button type="button" class="btn btn-sm" (click)="clear()"><tui-icon icon="@tui.funnel-x" /> Clear filters</button></div>
      }
    </section>

    @if (page(); as p) {
      <div class="card mb-4 grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Totals for this view">
        <div class="flex items-center justify-between gap-3 px-4 py-3 sm:block sm:py-4">
          <div class="field-label">Income</div>
          <div class="num text-lg font-semibold whitespace-nowrap text-income sm:mt-1 sm:text-xl">{{ p.summary.income | money }}</div>
        </div>
        <div class="flex items-center justify-between gap-3 px-4 py-3 sm:block sm:py-4">
          <div class="field-label">Expenses</div>
          <div class="num text-lg font-semibold whitespace-nowrap text-expense sm:mt-1 sm:text-xl">{{ p.summary.expense | money }}</div>
        </div>
        <div class="flex items-center justify-between gap-3 px-4 py-3 sm:block sm:py-4">
          <div class="field-label">Net movement</div>
          <div class="num text-lg font-semibold whitespace-nowrap sm:mt-1 sm:text-xl" [class.text-income]="p.summary.net >= 0" [class.text-expense]="p.summary.net < 0">{{ p.summary.net | money: 'sign' }}</div>
        </div>
      </div>
    }

    @if (error()) {
      <sm-error-state [message]="error()!" (retry)="load()" />
    } @else if (loading() && !page()) {
      <div class="card card-pad flex flex-col gap-3"><sm-skeleton height="48px" /><sm-skeleton height="48px" /><sm-skeleton height="48px" /></div>
    } @else if (page(); as p) {
      <div class="card overflow-hidden transition-opacity" [style.opacity]="loading() ? 0.6 : 1">
        @if (p.items.length === 0) {
          <sm-empty-state icon="@tui.arrow-left-right" [title]="hasFilters() ? 'No matching transactions' : 'No transactions in this period'"
            [hint]="hasFilters() ? 'Try changing or clearing your filters.' : 'Add your first transaction to get started.'"
            [actionLabel]="hasFilters() ? 'Clear filters' : 'Add transaction'" (action)="hasFilters() ? clear() : add()" />
        } @else {
          <sm-transaction-list [items]="p.items" [grouped]="groupByDay()" [dailyTotals]="p.dailyTotals" (select)="open($event)" />
          <nav class="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3 text-sm text-muted" aria-label="Pagination">
            <span>{{ rangeLabel() }}</span>
            <span class="flex items-center gap-2">
              <sm-select class="w-24" size="s" ariaLabel="Rows per page" [options]="pageSizeOpts" [value]="pageSize()" (valueChange)="pageSize.set($event ?? 50)" />
              <button type="button" class="btn btn-sm" [disabled]="pageNo() <= 1" (click)="pageNo.set(pageNo() - 1)" aria-label="Previous page"><tui-icon icon="@tui.chevron-left" /></button>
              <span class="num">{{ pageNo() }} / {{ pages() }}</span>
              <button type="button" class="btn btn-sm" [disabled]="pageNo() >= pages()" (click)="pageNo.set(pageNo() + 1)" aria-label="Next page"><tui-icon icon="@tui.chevron-right" /></button>
            </span>
          </nav>
        }
      </div>
    }
  `,
})
export class TransactionsPage {
  protected readonly accountOpts = computed(() => [{ value: '', label: 'All accounts' }, ...this.ref.accounts().map((a) => ({ value: a.id, label: a.name }))]);
  protected readonly categoryOpts = computed(() => [
    { value: '', label: 'All categories' }, { value: 'none', label: 'Uncategorized' },
    ...this.ref.categories().map((c) => ({ value: c.id, label: c.type === 'INCOME' ? `${c.name} (income)` : c.name })),
  ]);
  protected readonly originOpts = [{ value: '', label: 'Manual & automatic' }, { value: 'MANUAL', label: 'Manual only' }, { value: 'AUTOMATION', label: 'Automation only' }];
  protected readonly sortOpts = [
    { value: 'date:desc', label: 'Newest first' }, { value: 'date:asc', label: 'Oldest first' },
    { value: 'amount:desc', label: 'Largest amount' }, { value: 'amount:asc', label: 'Smallest amount' }, { value: 'title:asc', label: 'Title A–Z' },
  ];
  protected readonly pageSizeOpts = [{ value: 25, label: '25' }, { value: 50, label: '50' }, { value: 100, label: '100' }];
  protected readonly ref = inject(RefData);
  protected readonly dialogs = inject(Dialogs);
  private readonly api = inject(TransactionsApi);
  private readonly settings = inject(SettingsStore);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(ConfirmService);

  protected readonly mode = signal<'month' | 'range'>('month');
  protected readonly month = signal(this.settings.thisMonth());
  protected readonly from = signal(`${this.settings.thisMonth()}-01`);
  protected readonly to = signal(lastDayOfMonth(this.settings.thisMonth()));
  protected readonly kind = signal<KindFilter>('');
  protected readonly accountId = signal('');
  protected readonly categoryId = signal('');
  protected readonly eventId = signal('');
  protected readonly eventFilterOpts = computed(() => [{ value: '', label: 'All events' }, ...this.ref.events().map((e) => ({ value: e.id, label: e.name }))]);
  protected readonly origin = signal('');
  protected readonly q = signal('');
  protected readonly sort = signal('date:desc');
  protected readonly pageNo = signal(1);
  protected readonly pageSize = signal(50);

  protected readonly page = signal<TransactionPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly exporting = signal(false);
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected readonly filtersOpen = signal(false);
  protected readonly activeCount = computed(() => [this.kind(), this.accountId(), this.categoryId(), this.eventId(), this.origin()].filter(Boolean).length);
  protected readonly subtitle = computed(() => {
    const t = this.page()?.total;
    return t === undefined ? '' : `${t} ${t === 1 ? 'transaction' : 'transactions'}`;
  });

  protected readonly groupByDay = computed(() => this.sort().startsWith('date'));
  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.page()?.total ?? 0) / this.pageSize())));
  protected readonly rangeLabel = computed(() => {
    const p = this.page();
    if (!p || p.total === 0) return '';
    const start = (p.page - 1) * p.pageSize + 1;
    return `${start}–${start + p.items.length - 1} of ${p.total}`;
  });
  protected readonly hasFilters = computed(() => !!(this.kind() || this.accountId() || this.categoryId() || this.eventId() || this.origin() || this.q()));

  private readonly query = computed<TxQuery>(() => {
    const [sort, dir] = this.sort().split(':');
    return {
      ...(this.mode() === 'month' ? { month: this.month() } : { from: this.from(), to: this.to() }),
      kind: this.kind(), accountId: this.accountId(), categoryId: this.categoryId(), eventId: this.eventId(), origin: this.origin(),
      q: this.q(), sort, dir,
    };
  });

  constructor() {
    // any filter change goes back to page 1
    effect(() => { this.query(); this.pageSize(); untracked(() => this.pageNo.set(1)); });
    effect(() => { this.query(); this.pageNo(); this.pageSize(); untracked(() => this.load()); });
  }

  protected load(): void {
    this.loading.set(true); this.error.set(null);
    this.api.list({ ...this.query(), page: this.pageNo(), pageSize: this.pageSize() }).subscribe({
      next: (p) => { this.page.set(p); this.loading.set(false); },
      error: (e) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  protected onSearch(v: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.q.set(v.trim()), 300);
  }
  protected clear(): void {
    this.kind.set(''); this.accountId.set(''); this.categoryId.set(''); this.eventId.set(''); this.origin.set(''); this.q.set('');
  }

  protected async add(): Promise<void> { if (await this.dialogs.transaction({ accountId: this.accountId() || undefined })) this.load(); }

  protected async open(t: Transaction): Promise<void> {
    if (t.transfer) {
      if (await this.confirm.ask({
        title: 'Delete this transfer?', message: `${t.transfer.fromAccountName} → ${t.transfer.toAccountName}. Both sides are removed.`,
        confirmLabel: 'Delete transfer', danger: true,
      })) {
        this.api.removeTransfer(t.transfer.id).subscribe({
          next: () => { this.toast.success('Transfer deleted'); this.ref.refreshAccounts().subscribe(); this.load(); },
          error: (e) => this.toast.error(e),
        });
      }
      return;
    }
    if (await this.dialogs.editTransaction(t)) this.load();
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    this.api.exportCsv(this.query()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'transactions.csv'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        this.exporting.set(false);
      },
      error: (e) => { this.exporting.set(false); this.toast.error(e); },
    });
  }
}
