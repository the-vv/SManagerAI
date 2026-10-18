import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TuiDialogContext } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { Toast } from '../../core/services/toast.service';
import { ColorPickerComponent, IconPickerComponent } from '../../shared/components/pickers.component';
import { Category } from '../../shared/models/api.models';
import { CategoriesApi } from './categories.api';

@Component({
  selector: 'sm-category-form',
  imports: [ReactiveFormsModule, ColorPickerComponent, IconPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
      <h2 class="m-0 text-lg font-semibold">{{ category ? 'Edit category' : 'New category' }}</h2>
      @if (!category) {
        <div class="seg self-start" role="group" aria-label="Category type">
          <button type="button" [attr.aria-pressed]="form.controls.type.value === 'EXPENSE'" (click)="form.controls.type.setValue('EXPENSE')">Expense</button>
          <button type="button" [attr.aria-pressed]="form.controls.type.value === 'INCOME'" (click)="form.controls.type.setValue('INCOME')">Income</button>
        </div>
      }
      <div>
        <label class="field-label" for="cat-name">Name *</label>
        <input id="cat-name" class="input" formControlName="name" maxlength="60" [class.invalid]="submitted() && form.controls.name.invalid" />
        @if (submitted() && form.controls.name.invalid) { <div class="error-text">Name is required.</div> }
      </div>
      <div><span class="field-label">Colour (optional)</span><sm-color-picker formControlName="color" /></div>
      <div><span class="field-label">Icon (optional)</span><sm-icon-picker formControlName="icon" /></div>
      <div class="dialog-actions justify-end">
        <button type="button" class="btn" (click)="context.completeWith(false)">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">Save</button>
      </div>
    </form>
  `,
})
export class CategoryFormDialog {
  readonly context = injectContext<TuiDialogContext<boolean, { category?: Category; type?: 'INCOME' | 'EXPENSE' }>>();
  protected readonly category = this.context.data?.category;
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(CategoriesApi);
  private readonly toast = inject(Toast);
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.control(this.category?.name ?? '', [Validators.required, Validators.pattern(/\S/)]),
    type: this.fb.control<'INCOME' | 'EXPENSE'>(this.category?.type ?? this.context.data?.type ?? 'EXPENSE'),
    color: this.fb.control<string | null>(this.category?.color ?? null),
    icon: this.fb.control<string | null>(this.category?.icon ?? null),
  });

  protected save(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    const req = this.category
      ? this.api.update(this.category.id, { name: v.name.trim(), color: v.color, icon: v.icon })
      : this.api.create({ name: v.name.trim(), type: v.type, color: v.color, icon: v.icon });
    req.subscribe({
      next: () => { this.toast.success('Category saved'); this.context.completeWith(true); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}
