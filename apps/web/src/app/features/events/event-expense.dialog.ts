import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TuiDialogContext, TuiIcon } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { ApiClient } from '../../core/api/api.client';
import { dateKey, zonedToUtc } from '../../core/format/datetime';
import { SettingsStore } from '../../core/services/settings.store';
import { Toast } from '../../core/services/toast.service';
import { AmountInputComponent } from '../../shared/components/amount-input.component';
import { SelectComponent } from '../../shared/components/select.component';
import { EventExpense, Person } from '../../shared/models/api.models';

export interface ExpenseFormData { eventId: string; people: Person[]; expense?: EventExpense; }

const NEW = '__new__';

/** Something another person paid for in an event. It never touches your accounts. */
@Component({
  selector: 'sm-event-expense-form',
  imports: [ReactiveFormsModule, AmountInputComponent, SelectComponent, TuiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
      <div>
        <h2 class="m-0 text-lg font-semibold">{{ data.expense ? 'Edit expense' : 'Add expense by someone else' }}</h2>
        <p class="m-0 mt-1 text-sm text-muted">Counted in this event only – not in your accounts.</p>
      </div>
      <div>
        <label class="field-label" for="ex-who">Who paid? *</label>
        <sm-select inputId="ex-who" formControlName="person" [options]="personOpts()" />
        @if (form.controls.person.value === newKey) {
          <input class="input mt-2" formControlName="newName" maxlength="60" placeholder="Name, e.g. Ravi" aria-label="New person name" [class.invalid]="submitted() && !form.controls.newName.value.trim()" />
          @if (submitted() && !form.controls.newName.value.trim()) { <div class="error-text">Enter a name.</div> }
        }
      </div>
      <div>
        <label class="field-label" for="ex-amount">Amount *</label>
        <sm-amount-input inputId="ex-amount" formControlName="amount" [invalid]="submitted() && form.controls.amount.invalid" />
        @if (submitted() && form.controls.amount.invalid) { <div class="error-text">Enter an amount greater than zero.</div> }
      </div>
      <div>
        <label class="field-label" for="ex-title">What for? *</label>
        <input id="ex-title" class="input" formControlName="title" maxlength="120" placeholder="e.g. Dinner" [class.invalid]="submitted() && form.controls.title.invalid" />
        @if (submitted() && form.controls.title.invalid) { <div class="error-text">Title is required.</div> }
      </div>
      <div>
        <label class="field-label" for="ex-date">Date</label>
        <input id="ex-date" type="date" class="input" formControlName="date" />
      </div>
      <div class="dialog-actions justify-between">
        @if (data.expense) { <button type="button" class="btn btn-danger" (click)="remove()" [disabled]="busy()"><tui-icon icon="@tui.trash" /> Delete</button> } @else { <span></span> }
        <div class="flex gap-2">
          <button type="button" class="btn" (click)="context.completeWith(false)">Cancel</button>
          <button type="submit" class="btn btn-primary" [disabled]="busy()">Save</button>
        </div>
      </div>
    </form>
  `,
})
export class EventExpenseDialog {
  readonly context = injectContext<TuiDialogContext<boolean, ExpenseFormData>>();
  protected readonly data = this.context.data;
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(ApiClient);
  private readonly toast = inject(Toast);
  private readonly tz = inject(SettingsStore).tz();
  protected readonly newKey = NEW;
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly personOpts = computed(() => [
    ...this.data.people.map((p) => ({ value: p.id, label: p.name })),
    ...(this.data.expense ? [] : [{ value: NEW, label: '＋ New person…' }]),
  ]);

  protected readonly form = this.fb.group({
    person: this.fb.control(this.data.expense?.person.id ?? this.data.people[0]?.id ?? NEW, Validators.required),
    newName: this.fb.control(''),
    amount: this.fb.control<number | null>(this.data.expense?.amount ?? null, [Validators.required, Validators.min(1)]),
    title: this.fb.control(this.data.expense?.title ?? '', [Validators.required, Validators.pattern(/\S/)]),
    date: this.fb.control(dateKey(this.data.expense?.occurredAt ?? new Date(), this.tz)),
  });

  protected save(): void {
    this.submitted.set(true);
    const v = this.form.getRawValue();
    const isNew = v.person === NEW;
    if (this.form.invalid || (isNew && !v.newName.trim())) return;
    const body = {
      title: v.title.trim(), amount: v.amount!, occurredAt: zonedToUtc(v.date, '12:00', this.tz).toISOString(),
      ...(isNew ? { personName: v.newName.trim() } : { personId: v.person }),
    };
    const base = `/events/${this.data.eventId}/expenses`;
    this.busy.set(true);
    (this.data.expense ? this.api.patch(`${base}/${this.data.expense.id}`, body) : this.api.post(base, body)).subscribe({
      next: () => { this.toast.success('Expense saved'); this.context.completeWith(true); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }

  protected remove(): void {
    this.busy.set(true);
    this.api.delete(`/events/${this.data.eventId}/expenses/${this.data.expense!.id}`).subscribe({
      next: () => { this.toast.success('Expense deleted'); this.context.completeWith(true); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}
