import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TuiDialogContext } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { Toast } from '../../core/services/toast.service';
import { AmountInputComponent } from '../../shared/components/amount-input.component';
import { Automation, AutomationMode, Frequency, IntervalUnit } from '../../shared/models/api.models';
import { FREQUENCIES } from '../../shared/models/constants';
import { AutomationsApi } from './automations.api';
import { SelectComponent } from '../../shared/components/select.component';
import { DateInputComponent } from '../../shared/components/date-input.component';

@Component({
  selector: 'sm-automation-form',
  imports: [ReactiveFormsModule, AmountInputComponent, SelectComponent, DateInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
      <div class="flex items-center justify-between gap-3">
        <h2 class="m-0 text-lg font-semibold">{{ automation ? 'Edit automation' : 'New automation' }}</h2>
        <div class="seg" role="group" aria-label="Type">
          <button type="button" [attr.aria-pressed]="kind() === 'EXPENSE'" (click)="setKind('EXPENSE')">Expense</button>
          <button type="button" [attr.aria-pressed]="kind() === 'INCOME'" (click)="setKind('INCOME')">Income</button>
        </div>
      </div>

      <div>
        <label class="field-label" for="au-title">Title *</label>
        <input id="au-title" class="input" formControlName="title" maxlength="120" placeholder="e.g. Home loan EMI"
          [class.invalid]="submitted() && form.controls.title.invalid" />
        @if (submitted() && form.controls.title.invalid) { <div class="error-text">Title is required.</div> }
      </div>
      <div>
        <label class="field-label" for="au-amt">Amount *</label>
        <sm-amount-input inputId="au-amt" formControlName="amount" [invalid]="submitted() && form.controls.amount.invalid" />
        @if (submitted() && form.controls.amount.invalid) { <div class="error-text">Enter an amount greater than zero.</div> }
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="field-label" for="au-acc">Account</label>
          <sm-select inputId="au-acc" formControlName="accountId" [options]="accountOpts()" />
        </div>
        <div>
          <label class="field-label" for="au-cat">Category</label>
          <sm-select inputId="au-cat" formControlName="categoryId" [options]="categoryOpts()" />
        </div>
        <div>
          <label class="field-label" for="au-freq">Frequency</label>
          <sm-select inputId="au-freq" formControlName="frequency" [options]="frequencies" />
        </div>
        @if (isCustom()) {
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="field-label" for="au-every">Every</label>
              <input id="au-every" type="number" min="1" max="365" class="input" formControlName="customEvery" />
            </div>
            <div>
              <label class="field-label" for="au-unit">Unit</label>
              <sm-select inputId="au-unit" formControlName="customUnit" [options]="unitOpts" />
            </div>
          </div>
        }
        @if (usesDayOfMonth()) {
          <div>
            <label class="field-label" for="au-dom">Day of month</label>
            <sm-select inputId="au-dom" formControlName="dayOfMonth" [options]="domOpts" />
            <p class="m-0 mt-1 text-xs text-muted">Short months use their last day (e.g. 31 → 28/29 Feb).</p>
          </div>
        }
        <div>
          <label class="field-label" for="au-start">Start date</label>
          <sm-date inputId="au-start" formControlName="startDate" />
        </div>
        <div>
          <label class="field-label" for="au-end">End date (optional)</label>
          <sm-date inputId="au-end" formControlName="endDate" [clearable]="true" />
        </div>
      </div>

      <fieldset class="m-0 rounded-xl border border-line bg-surface-2 p-3">
        <legend class="px-1 text-xs font-medium text-muted">When an occurrence is due</legend>
        <div class="flex flex-col gap-2">
          <label class="flex cursor-pointer items-start gap-3 text-sm">
            <input type="radio" formControlName="mode" value="REMINDER" class="mt-1" />
            <span><b>Remind me</b> – shows in your reminders; you confirm before it is recorded.</span>
          </label>
          <label class="flex cursor-pointer items-start gap-3 text-sm">
            <input type="radio" formControlName="mode" value="AUTO" class="mt-1" />
            <span><b>Record automatically</b> – a labelled transaction is created on the due date.</span>
          </label>
        </div>
        <div class="mt-3">
          <label class="field-label" for="au-rem">Heads-up reminder (days before)</label>
          <input id="au-rem" type="number" min="0" max="30" class="input !w-28" formControlName="reminderDaysBefore" />
        </div>
        <p class="m-0 mt-2 text-xs text-muted">SManager only records or reminds you. It never moves real money or triggers bank debits.</p>
      </fieldset>

      @if (!automation && startsInPast()) {
        <label class="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" formControlName="backfill" class="mt-1" />
          <span>Also record the occurrences that were already due since the start date.</span>
        </label>
      }
      @if (automation) {
        <label class="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" formControlName="isEnabled" /> Enabled
        </label>
      }

      <div class="dialog-actions justify-end">
        <button type="button" class="btn" (click)="context.completeWith(false)">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  `,
})
export class AutomationFormDialog {
  readonly context = injectContext<TuiDialogContext<boolean, Automation | undefined>>();
  protected readonly automation = this.context.data;
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AutomationsApi);
  private readonly ref = inject(RefData);
  private readonly settings = inject(SettingsStore);
  private readonly toast = inject(Toast);

  protected readonly frequencies = FREQUENCIES;
  protected readonly days = Array.from({ length: 31 }, (_, i) => i + 1);
  protected readonly accounts = this.ref.activeAccounts;
  protected readonly accountOpts = computed(() => this.accounts().map((a) => ({ value: a.id, label: a.name })));
  protected readonly unitOpts = [{ value: 'DAY' as const, label: 'Days' }, { value: 'WEEK' as const, label: 'Weeks' }, { value: 'MONTH' as const, label: 'Months' }];
  protected readonly domOpts: { value: number | null; label: string }[] = [
    { value: null, label: 'Same as start date' }, ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
  ];
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly kind = signal<'INCOME' | 'EXPENSE'>(this.automation?.kind ?? 'EXPENSE');
  protected readonly categoryOpts = computed(() => [{ value: null as string | null, label: 'Uncategorized' }, ...this.categories().map((c) => ({ value: c.id as string | null, label: c.name }))]);
  protected readonly categories = computed(() => (this.kind() === 'INCOME' ? this.ref.incomeCategories() : this.ref.expenseCategories()));

  protected readonly form = this.fb.group({
    title: this.fb.control('', [Validators.required, Validators.pattern(/\S/)]),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    accountId: this.fb.control(this.ref.defaultAccount()?.id ?? '', Validators.required),
    categoryId: this.fb.control<string | null>(null),
    frequency: this.fb.control<Frequency>('MONTHLY'),
    customEvery: this.fb.control<number | null>(2),
    customUnit: this.fb.control<IntervalUnit>('WEEK'),
    dayOfMonth: this.fb.control<number | null>(null),
    startDate: this.fb.control(this.settings.today(), Validators.required),
    endDate: this.fb.control(''),
    mode: this.fb.control<AutomationMode>(this.settings.settings().defaultAutomationMode),
    reminderDaysBefore: this.fb.control(this.settings.settings().reminderDaysBefore),
    backfill: this.fb.control(false),
    isEnabled: this.fb.control(true),
  });

  private readonly freq = signal<Frequency>('MONTHLY');
  private readonly unit = signal<IntervalUnit>('WEEK');
  private readonly start = signal(this.settings.today());
  protected readonly isCustom = computed(() => this.freq() === 'CUSTOM');
  protected readonly usesDayOfMonth = computed(() =>
    this.freq() === 'CUSTOM' ? this.unit() === 'MONTH' : !['DAILY', 'WEEKLY'].includes(this.freq()));
  protected readonly startsInPast = computed(() => this.start() < this.settings.today());

  constructor() {
    const a = this.automation;
    if (a) {
      this.form.patchValue({
        title: a.title, amount: a.amount, accountId: a.accountId, categoryId: a.categoryId, frequency: a.frequency,
        customEvery: a.customEvery ?? 2, customUnit: a.customUnit ?? 'WEEK', dayOfMonth: a.dayOfMonth,
        startDate: a.startDate, endDate: a.endDate ?? '', mode: a.mode, reminderDaysBefore: a.reminderDaysBefore,
        isEnabled: a.isEnabled,
      });
      this.freq.set(a.frequency); this.unit.set(a.customUnit ?? 'WEEK'); this.start.set(a.startDate);
    }
    this.form.controls.frequency.valueChanges.subscribe((v) => this.freq.set(v));
    this.form.controls.customUnit.valueChanges.subscribe((v) => this.unit.set(v));
    this.form.controls.startDate.valueChanges.subscribe((v) => this.start.set(v));
  }

  protected setKind(k: 'INCOME' | 'EXPENSE'): void {
    this.kind.set(k);
    if (!this.categories().some((c) => c.id === this.form.controls.categoryId.value)) this.form.controls.categoryId.setValue(null);
  }

  protected save(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    if (v.endDate && v.endDate < v.startDate) { this.toast.info('End date must not be before the start date'); return; }
    const custom = v.frequency === 'CUSTOM';
    const body = {
      title: v.title.trim(), kind: this.kind(), amount: v.amount!, accountId: v.accountId, categoryId: v.categoryId,
      frequency: v.frequency, customEvery: custom ? v.customEvery : null, customUnit: custom ? v.customUnit : null,
      dayOfMonth: this.usesDayOfMonth() ? v.dayOfMonth : null, startDate: v.startDate, endDate: v.endDate || null,
      mode: v.mode, reminderDaysBefore: v.reminderDaysBefore ?? 0,
    };
    this.busy.set(true);
    const req = this.automation
      ? this.api.update(this.automation.id, { ...body, isEnabled: v.isEnabled })
      : this.api.create({ ...body, endDate: body.endDate, backfill: v.backfill });
    req.subscribe({
      next: () => { this.toast.success('Automation saved'); this.context.completeWith(true); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}
