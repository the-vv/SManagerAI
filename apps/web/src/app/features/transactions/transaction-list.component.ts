import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { relativeDayLabel } from '../../core/format/datetime';
import { SettingsStore } from '../../core/services/settings.store';
import { MoneyPipe, SmDatePipe, SmTimePipe } from '../../shared/pipes/format.pipes';
import { Transaction } from '../../shared/models/api.models';

interface Group { key: string; label: string; items: Transaction[]; income: number; expense: number; }

/** Renders transactions, optionally grouped by local day with daily totals. Presentational only. */
@Component({
  selector: 'sm-transaction-list',
  imports: [TuiIcon, MoneyPipe, SmDatePipe, SmTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (g of groups(); track g.key) {
      @if (grouped()) {
        <div class="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1.5 text-xs font-medium text-muted">
          <span>{{ g.label }}</span>
          <span class="num flex gap-3">
            @if (g.income > 0) { <span class="text-income">+{{ g.income | money }}</span> }
            @if (g.expense > 0) { <span class="text-expense">−{{ g.expense | money }}</span> }
          </span>
        </div>
      }
      <ul class="m-0 list-none p-0">
        @for (t of g.items; track t.id) {
          <li>
            <button type="button" class="flex min-h-[60px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-fg transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              (click)="select.emit(t)" [attr.aria-label]="t.title + ', ' + (t.amount | money)">
              <span class="grid size-10 shrink-0 place-items-center rounded-xl" [style.background]="tint(t)" [style.color]="tone(t)">
                <tui-icon [icon]="iconOf(t)" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ t.transfer ? transferLabel(t) : t.title }}</span>
                <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  @if (t.category) { <span>{{ t.category.name }}</span> }
                  @else if (!t.transfer) { <span class="text-faint">Uncategorized</span> }
                  @if (t.transfer) { <span>Transfer</span> }
                  @if (showAccount()) { <span>· {{ t.account.name }}</span> }
                  <span>· {{ grouped() ? (t.occurredAt | smTime) : (t.occurredAt | smDate) }}</span>
                  @if (t.source === 'AUTOMATION_AUTO') { <span class="chip !py-0"><tui-icon icon="@tui.repeat" [style.font-size.px]="12" /> Auto</span> }
                  @if (t.source === 'AUTOMATION_CONFIRMED') { <span class="chip !py-0"><tui-icon icon="@tui.check" [style.font-size.px]="12" /> Confirmed</span> }
                </span>
              </span>
              <span class="num shrink-0 text-right text-sm font-semibold" [style.color]="tone(t)">{{ signed(t) }}</span>
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class TransactionListComponent {
  readonly items = input.required<Transaction[]>();
  readonly grouped = input(true);
  readonly showAccount = input(true);
  readonly dailyTotals = input<Record<string, { income: number; expense: number }>>({});
  readonly select = output<Transaction>();

  private readonly settings = inject(SettingsStore);
  private readonly money = new MoneyPipeAdapter(this.settings);

  protected readonly groups = computed<Group[]>(() => {
    const today = this.settings.today();
    if (!this.grouped()) return [{ key: 'all', label: '', items: this.items(), income: 0, expense: 0 }];
    const map = new Map<string, Group>();
    for (const t of this.items()) {
      const key = this.settings.dayKey(t.occurredAt);
      let g = map.get(key);
      if (!g) {
        const rel = relativeDayLabel(key, today);
        const date = this.settings.dateOfKey(key);
        const totals = this.dailyTotals()[key];
        g = { key, label: rel ? `${rel} · ${date}` : date, items: [], income: totals?.income ?? 0, expense: totals?.expense ?? 0 };
        map.set(key, g);
      }
      g.items.push(t);
    }
    return [...map.values()];
  });

  protected iconOf(t: Transaction): string {
    if (t.transfer) return '@tui.arrow-left-right';
    if (t.category?.icon) return `@tui.${t.category.icon}`;
    return t.kind === 'INCOME' ? '@tui.arrow-down-left' : '@tui.arrow-up-right';
  }
  protected tone(t: Transaction): string {
    if (t.transfer) return 'var(--balance)';
    return t.kind === 'INCOME' ? 'var(--income)' : 'var(--expense)';
  }
  protected tint(t: Transaction): string {
    const c = this.settings.settings().useCategoryColors ? t.category?.color : null;
    if (c) return `color-mix(in srgb, ${c} 18%, transparent)`;
    if (t.transfer) return 'var(--balance-soft)';
    return t.kind === 'INCOME' ? 'var(--income-soft)' : 'var(--expense-soft)';
  }
  protected signed(t: Transaction): string {
    const m = this.money.fmt(t.amount);
    if (t.transfer) return m;
    return t.kind === 'INCOME' ? `+${m}` : `−${m}`;
  }
  protected transferLabel(t: Transaction): string {
    const tr = t.transfer!;
    return `${tr.fromAccountName} → ${tr.toAccountName}`;
  }
}

class MoneyPipeAdapter {
  constructor(private readonly s: SettingsStore) {}
  fmt(minor: number): string { return this.s.money(minor); }
}
