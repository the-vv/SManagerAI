import { ChangeDetectionStrategy, Component, computed, forwardRef, input, linkedSignal, output, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TuiDay } from '@taiga-ui/cdk';
import { TuiInputDate } from '@taiga-ui/kit';
import { TuiTextfield } from '@taiga-ui/core';

const toDay = (s: string | null | undefined): TuiDay | null => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? TuiDay.jsonParse(s) : null);
const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (d: TuiDay) => `${d.year}-${pad(d.month + 1)}-${pad(d.day)}`;

/**
 * Taiga UI date field: the Taiga calendar popup on desktop and, because of `type="date"`, the native OS date
 * picker on phones/tablets (Taiga's mobile mode). The value is a plain 'YYYY-MM-DD' string (what the
 * forms and API use): bind it with `formControlName`, or with `[value]` + `(valueChange)`.
 */
@Component({
  selector: 'sm-date',
  imports: [FormsModule, TuiInputDate, TuiTextfield],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateInputComponent), multi: true }],
  template: `
    <tui-textfield [tuiTextfieldSize]="size()" [tuiTextfieldCleaner]="clearable()">
      <input tuiInputDate type="date" [attr.id]="inputId() || null" [attr.aria-label]="ariaLabel() || null" [min]="minDay()" [max]="maxDay()"
        [ngModel]="day()" (ngModelChange)="pick($event)" [disabled]="disabled()" (blur)="onTouched()" />
      <tui-calendar *tuiDropdown />
    </tui-textfield>
  `,
})
export class DateInputComponent implements ControlValueAccessor {
  readonly inputId = input('');
  readonly ariaLabel = input('');
  readonly size = input<'s' | 'm' | 'l'>('m');
  /** shows a clear (x) button; clearing emits '' */
  readonly clearable = input(false);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly value = input<string>('');
  readonly valueChange = output<string>();

  /** follows the `value` input (signal-style use); form writes and typing set it directly */
  protected readonly day = linkedSignal<TuiDay | null>(() => toDay(this.value()));
  protected readonly disabled = signal(false);
  protected readonly minDay = computed(() => toDay(this.min()));
  protected readonly maxDay = computed(() => toDay(this.max()));

  private onChange: (v: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected pick(d: TuiDay | null): void {
    this.day.set(d);
    const key = d ? toKey(d) : '';
    this.onChange(key);
    this.valueChange.emit(key);
  }

  writeValue(v: string | null): void { this.day.set(toDay(v)); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }
}
