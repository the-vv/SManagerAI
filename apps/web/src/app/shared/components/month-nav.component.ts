import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { monthLabel, shiftMonth } from '../../core/format/datetime';

/** Previous / next month stepper with a native month picker (touch friendly). */
@Component({
  selector: 'sm-month-nav',
  imports: [TuiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1">
      <button type="button" class="btn-ghost !min-h-9 !min-w-9 !px-0" aria-label="Previous month" (click)="go(-1)">
        <tui-icon icon="@tui.chevron-left" />
      </button>
      <label class="relative cursor-pointer select-none px-2 text-center text-sm font-semibold" style="min-width: 8.5rem">
        {{ label() }}
        <input
          type="month" class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Choose month" [value]="month()" (change)="pick($any($event.target).value)"
        />
      </label>
      <button type="button" class="btn-ghost !min-h-9 !min-w-9 !px-0" aria-label="Next month" (click)="go(1)">
        <tui-icon icon="@tui.chevron-right" />
      </button>
    </div>
  `,
})
export class MonthNavComponent {
  readonly month = input.required<string>();
  readonly monthChange = output<string>();
  protected readonly label = computed(() => monthLabel(this.month()));

  protected go(delta: number): void { this.monthChange.emit(shiftMonth(this.month(), delta)); }
  protected pick(v: string): void { if (/^\d{4}-\d{2}$/.test(v)) this.monthChange.emit(v); }
}
