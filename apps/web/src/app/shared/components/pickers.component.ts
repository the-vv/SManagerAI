import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TuiIcon } from '@taiga-ui/core';
import { COLOR_PALETTE, PICKABLE_ICONS } from '../models/constants';

abstract class Picker implements ControlValueAccessor {
  protected readonly value = signal<string | null>(null);
  protected readonly disabled = signal(false);
  private onChange: (v: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  writeValue(v: string | null): void { this.value.set(v ?? null); }
  registerOnChange(fn: (v: string | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }
  protected select(v: string | null): void { this.value.set(v); this.onChange(v); this.onTouched(); }
}

/** Optional colour: click a swatch, or "None". */
@Component({
  selector: 'sm-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ColorPickerComponent), multi: true }],
  template: `
    <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
      <button type="button" class="chip cursor-pointer" [attr.aria-checked]="value() === null" role="radio"
        [style.outline]="value() === null ? '2px solid var(--accent)' : 'none'" (click)="select(null)">None</button>
      @for (c of palette; track c) {
        <button type="button" role="radio" [attr.aria-checked]="value() === c" [attr.aria-label]="c"
          class="size-8 cursor-pointer rounded-full border-2 transition-transform hover:scale-110"
          [style.background]="c" [style.border-color]="value() === c ? 'var(--text)' : 'transparent'"
          (click)="select(c)"></button>
      }
    </div>
  `,
})
export class ColorPickerComponent extends Picker {
  protected readonly palette = COLOR_PALETTE;
}

@Component({
  selector: 'sm-icon-picker',
  imports: [TuiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => IconPickerComponent), multi: true }],
  template: `
    <div class="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto" role="radiogroup" aria-label="Icon">
      <button type="button" class="chip cursor-pointer" role="radio" [attr.aria-checked]="value() === null"
        [style.outline]="value() === null ? '2px solid var(--accent)' : 'none'" (click)="select(null)">None</button>
      @for (i of icons; track i) {
        <button type="button" role="radio" [attr.aria-checked]="value() === i" [attr.aria-label]="i"
          class="grid size-9 cursor-pointer place-items-center rounded-lg border border-line bg-surface-2 text-muted hover:text-fg"
          [style.outline]="value() === i ? '2px solid var(--accent)' : 'none'" (click)="select(i)">
          <tui-icon [icon]="'@tui.' + i" />
        </button>
      }
    </div>
  `,
})
export class IconPickerComponent extends Picker {
  readonly iconList = input<string[]>(PICKABLE_ICONS);
  protected get icons(): string[] { return this.iconList(); }
}
