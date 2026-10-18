import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiMonth } from '@taiga-ui/cdk';
import { TuiTextfield } from '@taiga-ui/core';
import { TuiIcon } from '@taiga-ui/core';
import { TuiInputMonth } from '@taiga-ui/kit';
import { shiftMonth } from '../../core/format/datetime';

/** Previous / next month stepper around Taiga UI's accessible month picker. Value is 'YYYY-MM'. */
@Component({
  selector: 'sm-month-nav',
  imports: [TuiIcon, FormsModule, TuiInputMonth, TuiTextfield],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="flex w-full items-center gap-1 sm:inline-flex sm:w-auto">
      <button type="button" class="btn btn-ghost !min-h-11 !min-w-11 shrink-0 !px-0" aria-label="Previous month" (click)="go(-1)">
        <tui-icon icon="@tui.chevron-left" />
      </button>
      <tui-textfield class="min-w-[9.5rem] flex-1 sm:w-48 sm:flex-none" tuiTextfieldSize="m">
        <input tuiInputMonth aria-label="Choose month" [ngModel]="tuiMonth()" (ngModelChange)="pick($event)" />
        <tui-calendar-month *tuiDropdown />
      </tui-textfield>
      <button type="button" class="btn btn-ghost !min-h-11 !min-w-11 shrink-0 !px-0" aria-label="Next month" (click)="go(1)">
        <tui-icon icon="@tui.chevron-right" />
      </button>
    </div>
  `,
})
export class MonthNavComponent {
  readonly month = input.required<string>();
  readonly monthChange = output<string>();
  protected readonly tuiMonth = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return new TuiMonth(y, m - 1);
  });

  protected go(delta: number): void { this.monthChange.emit(shiftMonth(this.month(), delta)); }
  protected pick(v: TuiMonth | null): void {
    if (v) this.monthChange.emit(`${v.year}-${String(v.month + 1).padStart(2, '0')}`);
  }
}
