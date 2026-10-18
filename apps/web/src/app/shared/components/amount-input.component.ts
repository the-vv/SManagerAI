import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, forwardRef, inject, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { minorToDecimal, parseMoney } from '../../core/format/money';
import { SettingsStore } from '../../core/services/settings.store';

/**
 * Text input bound to INTEGER MINOR UNITS. The user types "1,250.5"; the form control value is
 * 125050 (or null while empty/invalid). No floating point involved.
 */
@Component({
  selector: 'sm-amount-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AmountInputComponent), multi: true }],
  template: `
    <div class="relative">
      <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted num">{{ symbol() }}</span>
      <input
        #field
        class="input num pl-8 text-lg font-semibold"
        [class.invalid]="invalid()"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [id]="inputId()"
        [attr.aria-label]="label()"
        [attr.aria-invalid]="invalid()"
        [placeholder]="placeholder()"
        [value]="text()"
        [disabled]="disabled()"
        (input)="onInput($any($event.target).value)"
        (blur)="onBlur()"
      />
    </div>
  `,
})
export class AmountInputComponent implements ControlValueAccessor {
  readonly inputId = input<string>('');
  readonly label = input<string>('Amount');
  readonly placeholder = input<string>('0.00');
  /** Allow negative values (account opening balance, adjustments). */
  readonly allowNegative = input(false);
  readonly invalid = input(false);
  /** Focus (and select) the field when it is first shown, e.g. in a freshly opened dialog. */
  readonly autoFocus = input(false);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  protected readonly symbol = inject(SettingsStore).currencySymbol;

  private onChange: (v: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    afterNextRender(() => {
      // the dialog's focus trap settles first; focus afterwards so the amount keeps focus
      if (this.autoFocus()) setTimeout(() => { this.field().nativeElement.focus(); this.field().nativeElement.select(); }, 60);
    });
  }

  writeValue(v: number | null): void {
    this.text.set(v === null || v === undefined ? '' : minorToDecimal(v).replace(/\.00$/, ''));
  }
  registerOnChange(fn: (v: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }

  protected onInput(raw: string): void {
    this.text.set(raw);
    const parsed = parseMoney(raw);
    this.onChange(parsed !== null && (parsed >= 0 || this.allowNegative()) ? parsed : null);
  }
  protected onBlur(): void {
    const parsed = parseMoney(this.text());
    if (parsed !== null) this.text.set(minorToDecimal(parsed));
    this.onTouched();
  }
}
