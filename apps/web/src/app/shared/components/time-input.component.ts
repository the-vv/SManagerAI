import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Time field. Taiga UI's time input has no picker popup, so this uses the browser's native
 * `<input type="time">` (the OS sheet / wheel on phones, the clock popup on desktop), styled
 * like the other fields. The value is a 'HH:mm' string, as the forms and API use.
 */
@Component({
  selector: 'sm-time',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeInputComponent), multi: true }],
  template: `
    <input type="time" class="input" [attr.id]="inputId() || null" [attr.aria-label]="ariaLabel() || null"
      [value]="time()" [disabled]="disabled()" (input)="pick($any($event.target).value)" (change)="pick($any($event.target).value)" (blur)="onTouched()" />
  `,
})
export class TimeInputComponent implements ControlValueAccessor {
  readonly inputId = input('');
  readonly ariaLabel = input('');
  /** kept for API parity with the other fields (the native control has one size) */
  readonly size = input<'s' | 'm' | 'l'>('m');

  protected readonly time = signal('');
  protected readonly disabled = signal(false);

  private onChange: (v: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected pick(v: string): void {
    if (v === this.time()) return;
    this.time.set(v);
    this.onChange(v);
  }

  writeValue(v: string | null): void { this.time.set(/^\d{2}:\d{2}/.test(v ?? '') ? (v as string).slice(0, 5) : ''); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }
}
