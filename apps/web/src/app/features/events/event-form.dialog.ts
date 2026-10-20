import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TuiDialogContext } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { ApiClient } from '../../core/api/api.client';
import { Toast } from '../../core/services/toast.service';
import { AmountInputComponent } from '../../shared/components/amount-input.component';
import { TrackEvent } from '../../shared/models/api.models';

/** Create / edit an event (a trip, a wedding, ...). */
@Component({
  selector: 'sm-event-form',
  imports: [ReactiveFormsModule, AmountInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
      <h2 class="m-0 text-lg font-semibold">{{ event ? 'Edit event' : 'New event' }}</h2>
      <div>
        <label class="field-label" for="ev-name">Name *</label>
        <input id="ev-name" class="input" formControlName="name" maxlength="80" placeholder="e.g. Ooty trip" [class.invalid]="submitted() && form.controls.name.invalid" />
        @if (submitted() && form.controls.name.invalid) { <div class="error-text">Name is required.</div> }
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label class="field-label" for="ev-from">Starts (optional)</label><input id="ev-from" type="date" class="input" formControlName="startDate" /></div>
        <div><label class="field-label" for="ev-to">Ends (optional)</label><input id="ev-to" type="date" class="input" formControlName="endDate" /></div>
      </div>
      <div>
        <label class="field-label" for="ev-budget">Budget (optional)</label>
        <sm-amount-input inputId="ev-budget" formControlName="budget" />
      </div>
      <div>
        <label class="field-label" for="ev-notes">Notes</label>
        <textarea id="ev-notes" class="input" formControlName="notes" maxlength="500" placeholder="Optional"></textarea>
      </div>
      <div class="dialog-actions justify-end">
        <button type="button" class="btn" (click)="context.completeWith(false)">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">Save</button>
      </div>
    </form>
  `,
})
export class EventFormDialog {
  readonly context = injectContext<TuiDialogContext<boolean, TrackEvent | undefined>>();
  protected readonly event = this.context.data;
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(ApiClient);
  private readonly toast = inject(Toast);
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.control(this.event?.name ?? '', [Validators.required, Validators.pattern(/\S/)]),
    startDate: this.fb.control(this.event?.startDate ?? ''),
    endDate: this.fb.control(this.event?.endDate ?? ''),
    budget: this.fb.control<number | null>(this.event?.budget ?? null),
    notes: this.fb.control(this.event?.notes ?? ''),
  });

  protected save(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const editing = !!this.event;
    const body = {
      name: v.name.trim(),
      startDate: v.startDate || (editing ? null : undefined),
      endDate: v.endDate || (editing ? null : undefined),
      budget: v.budget && v.budget > 0 ? v.budget : (editing ? null : undefined),
      notes: v.notes.trim() || (editing ? null : undefined),
    };
    this.busy.set(true);
    const req = this.event ? this.api.patch(`/events/${this.event.id}`, body) : this.api.post('/events', body);
    req.subscribe({
      next: () => { this.toast.success(editing ? 'Event updated' : 'Event created'); this.context.completeWith(true); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}
