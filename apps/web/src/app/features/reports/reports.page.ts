import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { ApiClient } from '../../core/api/api.client';
import { lastDayOfMonth, monthLabel, shiftMonth } from '../../core/format/datetime';
import { SettingsStore } from '../../core/services/settings.store';
import { RefData } from '../../core/services/ref-data.store';
import { Toast } from '../../core/services/toast.service';
import { ChartComponent } from '../../shared/components/chart.component';
import { colorFor, compareOption, donutOption, lineOption, trendOption } from '../../shared/components/charts';
import { DotComponent, EmptyStateComponent, ErrorStateComponent, PageHeaderComponent, SkeletonComponent } from '../../shared/components/ui.components';
import { Report } from '../../shared/models/api.models';
import { accountTypeLabel, frequencyLabel } from '../../shared/models/constants';
import { MoneyPipe, PercentBpPipe, SmDatePipe } from '../../shared/pipes/format.pipes';
import { SelectComponent } from '../../shared/components/select.component';
import { DateInputComponent } from '../../shared/components/date-input.component';

type Preset = 'this-month' | '3m' | '6m' | '12m' | 'ytd' | 'custom';

@Component({
  selector: 'sm-reports-page',
  imports: [PageHeaderComponent, ChartComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent, DotComponent, MoneyPipe, SmDatePipe, PercentBpPipe, TuiIcon, SelectComponent, DateInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sm-page-header title="Reports" subtitle="Every figure comes from the same ledger calculations as the dashboard." />

    <section class="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center" aria-label="Report filters">
      <!-- phones: dropdown; wider screens: segmented control -->
      <label class="flex flex-col gap-1 sm:hidden"><span class="field-label">Period</span>
        <sm-select [options]="presetOpts()" [value]="preset()" (valueChange)="setPreset($event ?? 'this-month')" /></label>
      <div class="seg hidden sm:inline-flex" role="group" aria-label="Period">
        @for (p of presets; track p.id) {
          <button type="button" class="whitespace-nowrap" [attr.aria-pressed]="preset() === p.id" (click)="setPreset(p.id)">{{ p.label }}</button>
        }
      </div>
      @if (preset() === 'custom') {
        <div class="flex min-w-0 items-center gap-2">
          <sm-date class="min-w-0 flex-1 sm:w-44 sm:flex-none" ariaLabel="From" [value]="from()" (valueChange)="from.set($event)" />
          <span class="text-muted">→</span>
          <sm-date class="min-w-0 flex-1 sm:w-44 sm:flex-none" ariaLabel="To" [value]="to()" (valueChange)="to.set($event)" />
        </div>
      }
      <label class="flex flex-col gap-1 sm:ml-auto sm:block"><span class="field-label sm:sr-only">Account</span>
        <sm-select class="sm:w-56" [options]="accountOpts()" [value]="accountId()" (valueChange)="accountId.set($event ?? '')" /></label>
    </section>

    @if (error()) {
      <sm-error-state [message]="error()!" (retry)="load()" />
    } @else if (!data()) {
      <div class="grid gap-4 lg:grid-cols-2"><sm-skeleton height="300px" /><sm-skeleton height="300px" /></div>
    } @else if (data(); as r) {
      <div class="rise mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="card card-pad"><div class="field-label">Income</div><div class="num mt-1 text-lg font-semibold whitespace-nowrap sm:text-xl text-income">{{ r.summary.income | money }}</div></div>
        <div class="card card-pad"><div class="field-label">Expenses</div><div class="num mt-1 text-lg font-semibold whitespace-nowrap sm:text-xl text-expense">{{ r.summary.expense | money }}</div></div>
        <div class="card card-pad"><div class="field-label">Net savings</div><div class="num mt-1 text-lg font-semibold whitespace-nowrap sm:text-xl" [class.text-income]="r.summary.netMovement >= 0" [class.text-expense]="r.summary.netMovement < 0">{{ r.summary.netMovement | money: 'sign' }}</div></div>
        <div class="card card-pad"><div class="field-label">Closing balance</div><div class="num mt-1 text-lg font-semibold whitespace-nowrap sm:text-xl text-balance">{{ r.summary.closing | money }}</div>
          <div class="mt-1 text-xs text-muted">Opening {{ r.summary.opening | money }}</div></div>
      </div>

      <div class="rise grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <section class="card card-pad" aria-label="Monthly income versus expenses">
          <div class="mb-2 flex items-center justify-between gap-2"><h2 class="m-0 text-base font-semibold">Income vs expenses</h2>
            <button type="button" class="btn btn-sm" (click)="download('monthly')"><tui-icon icon="@tui.download" /> CSV</button></div>
          <sm-chart [build]="trend()" label="Monthly income versus expenses" height="280px" />
        </section>
        <section class="card card-pad" aria-label="Balance trend">
          <h2 class="m-0 mb-2 text-base font-semibold">Balance trend (month end)</h2>
          <sm-chart [build]="balanceTrend()" label="Month-end balance" height="280px" />
        </section>

        <section class="card card-pad" aria-label="Monthly net savings">
          <h2 class="m-0 mb-3 text-base font-semibold">Monthly net savings</h2>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[30rem] border-collapse text-sm">
              <thead><tr class="text-left text-xs text-muted"><th class="pb-2 font-medium">Month</th><th class="pb-2 text-right font-medium">Income</th><th class="pb-2 text-right font-medium">Expenses</th><th class="pb-2 text-right font-medium">Net</th></tr></thead>
              <tbody>
                @for (m of r.monthly; track m.month) {
                  <tr class="border-t border-line"><td class="py-2">{{ label(m.month) }}</td>
                    <td class="num py-2 text-right text-income">{{ m.income | money }}</td>
                    <td class="num py-2 text-right text-expense">{{ m.expense | money }}</td>
                    <td class="num py-2 text-right font-semibold" [class.text-income]="m.net >= 0" [class.text-expense]="m.net < 0">{{ m.net | money: 'sign' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="card card-pad" aria-label="Month over month spending">
          <h2 class="m-0 mb-1 text-base font-semibold">Spending: {{ label(r.monthOverMonth.month) }} vs {{ label(r.monthOverMonth.previousMonth) }}</h2>
          <p class="m-0 mb-2 text-xs text-muted">
            Total {{ r.monthOverMonth.totalCurrent | money }} ·
            <span [class.text-expense]="r.monthOverMonth.totalDelta > 0" [class.text-income]="r.monthOverMonth.totalDelta <= 0">{{ r.monthOverMonth.totalDelta | money: 'sign' }}</span>
          </p>
          @if (r.monthOverMonth.categories.length === 0) { <sm-empty-state icon="@tui.chart-column" title="No spending in these months" /> }
          @else { <sm-chart [build]="compare()" label="Category spending, this month versus last" height="240px" /> }
        </section>

        @for (kind of kinds; track kind.key) {
          <section class="card card-pad" [attr.aria-label]="kind.title">
            <div class="mb-3 flex items-center justify-between gap-2"><h2 class="m-0 text-base font-semibold">{{ kind.title }}</h2>
              <button type="button" class="btn btn-sm" (click)="download(kind.csv)"><tui-icon icon="@tui.download" /> CSV</button></div>
            @let b = kind.key === 'expense' ? r.expenseByCategory : r.incomeByCategory;
            @if (b.items.length === 0) { <sm-empty-state icon="@tui.chart-pie" title="Nothing in this period" /> }
            @else {
              <div class="grid items-center gap-4 sm:grid-cols-[170px_1fr]">
                <sm-chart [build]="donutFor(kind.key)" [label]="kind.title" height="170px" />
                <ul class="m-0 flex list-none flex-col gap-2 p-0">
                  @for (row of b.items; track $index) {
                    <li class="flex items-center gap-2 text-sm"><sm-dot [color]="colorOf(row, $index)" /><span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
                      <span class="num text-muted">{{ row.shareBp | pct }}</span><span class="num w-24 text-right font-medium">{{ row.total | money }}</span></li>
                  }
                </ul>
              </div>
            }
          </section>
        }

        <section class="card card-pad" aria-label="Account-wise summary">
          <div class="mb-3 flex items-center justify-between gap-2"><h2 class="m-0 text-base font-semibold">By account</h2>
            <button type="button" class="btn btn-sm" (click)="download('accounts')"><tui-icon icon="@tui.download" /> CSV</button></div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[30rem] border-collapse text-sm">
              <thead><tr class="text-left text-xs text-muted"><th class="pb-2 font-medium">Account</th><th class="pb-2 text-right font-medium">Income</th><th class="pb-2 text-right font-medium">Expenses</th><th class="pb-2 text-right font-medium">Closing</th></tr></thead>
              <tbody>
                @for (a of r.accounts; track a.id) {
                  <tr class="border-t border-line"><td class="py-2"><span class="font-medium">{{ a.name }}</span><span class="block text-xs text-muted">{{ typeLabel(a.type) }}{{ a.isActive ? '' : ' · inactive' }}</span></td>
                    <td class="num py-2 text-right text-income">{{ a.income | money }}</td><td class="num py-2 text-right text-expense">{{ a.expense | money }}</td>
                    <td class="num py-2 text-right font-semibold">{{ a.closingBalance | money }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="card card-pad" aria-label="Largest expenses">
          <div class="mb-3 flex items-center justify-between gap-2"><h2 class="m-0 text-base font-semibold">Largest expenses</h2>
            <button type="button" class="btn btn-sm" (click)="download('largest')"><tui-icon icon="@tui.download" /> CSV</button></div>
          @if (r.largestExpenses.length === 0) { <sm-empty-state icon="@tui.receipt" title="No expenses in this period" /> }
          <ul class="m-0 flex list-none flex-col gap-3 p-0">
            @for (e of r.largestExpenses; track e.id) {
              <li class="flex items-center gap-3"><span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ e.title }}</span>
                <span class="text-xs text-muted">{{ e.date | smDate }} · {{ e.accountName }}@if (e.categoryName) { · {{ e.categoryName }} }</span></span>
                <span class="num text-sm font-semibold text-expense">{{ e.amount | money }}</span></li>
            }
          </ul>
        </section>

        <section class="card card-pad lg:col-span-2" aria-label="Recurring payments">
          <div class="mb-1 flex items-center justify-between gap-2"><h2 class="m-0 text-base font-semibold">Recurring payments</h2>
            <button type="button" class="btn btn-sm" (click)="download('recurring')"><tui-icon icon="@tui.download" /> CSV</button></div>
          <p class="m-0 mb-3 text-xs text-muted">Enabled automations normalised to a monthly amount: <b class="text-expense">{{ r.recurring.monthlyExpenses | money }}</b> out · <b class="text-income">{{ r.recurring.monthlyIncome | money }}</b> in per month.</p>
          @if (r.recurring.items.length === 0) { <sm-empty-state icon="@tui.repeat" title="No recurring items" actionLabel="Add automation" actionLink="/automations" /> }
          @else {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[30rem] border-collapse text-sm">
                <thead><tr class="text-left text-xs text-muted"><th class="pb-2 font-medium">Title</th><th class="pb-2 font-medium">Frequency</th><th class="pb-2 font-medium">Next</th><th class="pb-2 text-right font-medium">Amount</th><th class="pb-2 text-right font-medium">Monthly</th></tr></thead>
                <tbody>
                  @for (i of r.recurring.items; track i.id) {
                    <tr class="border-t border-line"><td class="py-2 font-medium">{{ i.title }}<span class="block text-xs font-normal text-muted">{{ i.accountName }}</span></td>
                      <td class="py-2">{{ freq(i.frequency) }}</td><td class="py-2">{{ i.nextRunDate | smDate }}</td>
                      <td class="num py-2 text-right" [class.text-income]="i.kind === 'INCOME'" [class.text-expense]="i.kind === 'EXPENSE'">{{ i.amount | money }}</td>
                      <td class="num py-2 text-right text-muted">{{ i.monthlyEquivalent | money }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </div>
    }
  `,
})
export class ReportsPage {
  protected readonly ref = inject(RefData);
  private readonly api = inject(ApiClient);
  private readonly settings = inject(SettingsStore);
  private readonly toast = inject(Toast);

  protected readonly presetOpts = computed(() => this.presets.map((p) => ({ value: p.id, label: p.label })));
  protected readonly accountOpts = computed(() => [{ value: '', label: 'All accounts' }, ...this.ref.accounts().map((a) => ({ value: a.id, label: a.name }))]);
  protected readonly presets: Array<{ id: Preset; label: string }> = [
    { id: 'this-month', label: 'This month' }, { id: '3m', label: '3 months' }, { id: '6m', label: '6 months' },
    { id: '12m', label: '12 months' }, { id: 'ytd', label: 'Year to date' }, { id: 'custom', label: 'Custom' },
  ];
  protected readonly kinds = [
    { key: 'expense' as const, title: 'Expenses by category', csv: 'expense-categories' },
    { key: 'income' as const, title: 'Income by category', csv: 'income-categories' },
  ];
  protected readonly preset = signal<Preset>('6m');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly accountId = signal('');
  protected readonly data = signal<Report | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly typeLabel = accountTypeLabel;
  protected readonly freq = (f: Parameters<typeof frequencyLabel>[0]) => frequencyLabel(f);
  protected label = (m: string) => monthLabel(m);

  private readonly money = (v: number) => this.settings.money(v);
  private readonly compact = (v: number) => this.settings.money(v, { compact: true });
  protected readonly trend = computed(() => trendOption(this.data()?.monthly ?? [], this.money, this.compact));
  protected readonly balanceTrend = computed(() => {
    const m = this.data()?.monthly ?? [];
    return lineOption(m.map((x) => monthLabel(x.month, true)), m.map((x) => x.closingBalance), 'Balance', this.money, this.compact);
  });
  protected readonly compare = computed(() => {
    const mom = this.data()?.monthOverMonth;
    return compareOption((mom?.categories ?? []).slice(0, 8), [monthLabel(mom?.month ?? '2000-01', true), monthLabel(mom?.previousMonth ?? '2000-01', true)], this.money, this.compact);
  });

  constructor() {
    this.setPreset('6m');
    effect(() => { this.from(); this.to(); this.accountId(); untracked(() => this.load()); });
  }

  protected setPreset(p: Preset): void {
    this.preset.set(p);
    if (p === 'custom') return;
    const cur = this.settings.thisMonth();
    const start = p === 'this-month' ? cur : p === '3m' ? shiftMonth(cur, -2) : p === '6m' ? shiftMonth(cur, -5)
      : p === '12m' ? shiftMonth(cur, -11) : `${cur.slice(0, 4)}-01`;
    this.from.set(`${start}-01`);
    this.to.set(lastDayOfMonth(cur));
  }

  protected load(): void {
    if (!this.from() || !this.to()) return;
    this.error.set(null);
    this.api.get<Report>('/reports', { from: this.from(), to: this.to(), accountId: this.accountId() }).subscribe({
      next: (r) => this.data.set(r), error: (e) => this.error.set(e.message),
    });
  }

  protected donutFor(kind: 'expense' | 'income') {
    const r = this.data();
    return donutOption((kind === 'expense' ? r?.expenseByCategory : r?.incomeByCategory)?.items ?? [], this.money, this.settings.settings().useCategoryColors);
  }
  protected colorOf(r: { color: string | null; categoryId: string | null }, i: number): string {
    return colorFor(r, i, this.settings.settings().useCategoryColors);
  }

  protected download(section: string): void {
    this.api.text('/reports/export.csv', { from: this.from(), to: this.to(), accountId: this.accountId(), section }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `report-${section}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      error: (e) => this.toast.error(e),
    });
  }
}
