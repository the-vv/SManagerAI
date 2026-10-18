import { ChangeDetectionStrategy, Component, computed, forwardRef, input, model, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TuiDataListWrapper, TuiChevron, TuiSelect } from '@taiga-ui/kit';
import { TuiTextfield } from '@taiga-ui/core';

export interface SelectOption<T = string> { value: T; label: string; }

/**
 * Taiga UI dropdown (keyboard + screen-reader friendly) with a plain `{value, label}[]` API, so it
 * is a drop-in for native `<select>` in both reactive forms (`formControlName`) and signals
 * (`[value]` + `(valueChange)`). Option labels must be unique within one select.
 */
@Component({
  selector: 'sm-select',
  imports: [FormsModule, TuiSelect, TuiChevron, TuiDataListWrapper, TuiTextfield],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true }],
  template: `
    <tui-textfield tuiChevron [tuiTextfieldSize]="size()">
      @if (label()) { <label tuiLabel>{{ label() }}</label> }
      <input tuiSelect [attr.id]="inputId() || null" [attr.aria-label]="label() || ariaLabel()" [ngModel]="selectedLabel()" (ngModelChange)="pick($event)"
        [disabled]="disabled()" (blur)="onTouched()" />
      <tui-data-list-wrapper *tuiDropdown [items]="labels()" [size]="size()" />
    </tui-textfield>
  `,
})
export class SelectComponent<T = string> implements ControlValueAccessor {
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly label = input('');
  /** id of the inner input so an external `<label for>` works */
  readonly inputId = input('');
  readonly ariaLabel = input('');
  readonly size = input<'s' | 'm' | 'l'>('m');

  /** Two-way for signals: `[(value)]="x"`; reactive forms use the ControlValueAccessor instead. */
  readonly value = model<T | null>(null);
  protected readonly disabled = signal(false);

  protected readonly labels = computed(() => this.options().map((o) => o.label));
  protected readonly selectedLabel = computed(() => this.options().find((o) => o.value === this.value())?.label ?? null);

  private onChange: (v: T) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected pick(label: string | null): void {
    const o = this.options().find((x) => x.label === label);
    if (!o || o.value === this.value()) return;
    this.value.set(o.value);
    this.onChange(o.value);
  }

  writeValue(v: T | null): void { this.value.set(v); }
  registerOnChange(fn: (v: T) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }
}
