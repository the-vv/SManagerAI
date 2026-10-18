import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TuiDialogContext } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { dateKey, timeKey, zonedToUtc } from '../../core/format/datetime';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { Toast } from '../../core/services/toast.service';
import { AmountInputComponent } from '../../shared/components/amount-input.component';
import { Account } from '../../shared/models/api.models';
import { TransactionsApi } from '../transactions/transactions.api';
import { AccountsApi } from './accounts.api';
import { SelectComponent } from '../../shared/components/select.component';
import { DateInputComponent } from '../../shared/components/date-input.component';
import { TimeInputComponent } from '../../shared/components/time-input.component';

/** Manual balance correction ("set the balance to X as of date D, because ...") - stored as an adjustment, never as income/expense. */
@Component({
  selector: 'sm-adjust-dialog',
  imports: [ReactiveFormsModule, AmountInputComponent, DateInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
      <div>
        <h2 class="m-0 text-lg font-semibold">Correct balance</h2>
        <p class="m-0 mt-1 text-sm text-muted">
          {{ account.name }} – adds a clearly labelled adjustment. It does not count as income or an expense.
        </p>
      </div>
      <div>
        <label class="field-label" for="adj-target">Balance should be *</label>
        <sm-amount-input inputId="adj-target" formControlName="target" [allowNegative]="true" [invalid]="submitted() && form.controls.target.invalid" />
        <p class="m-0 mt-1 text-xs text-muted">The difference from the current ledger balance is calculated for you.</p>
      </div>
      <div>
        <label class="field-label" for="adj-date">As of date</label>
        <sm-date inputId="adj-date" formControlName="date" [max]="today" />
      </div>
      <div>
        <label class="field-label" for="adj-reason">Reason *</label>
        <input id="adj-reason" class="input" formControlName="reason" maxlength="200" placeholder="e.g. Reconciled with bank statement"
          [class.invalid]="submitted() && form.controls.reason.invalid" />
        @if (submitted() && form.controls.reason.invalid) { <div class="error-text">A reason is required.</div> }
      </div>
      <div class="dialog-actions justify-end">
        <button type="button" class="btn" (click)="context.completeWith(false)">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">Save adjustment</button>
      </div>
    </form>
  `,
})
export class AdjustDialog {
  readonly context = injectContext<TuiDialogContext<boolean, Account>>();
  protected readonly account = this.context.data;
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AccountsApi);
  private readonly toast = inject(Toast);
  protected readonly today = inject(SettingsStore).today();
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly form = this.fb.group({
    target: this.fb.control<number | null>(this.account.balance, Validators.required),
    date: this.fb.control(this.today, Validators.required),
    reason: this.fb.control('', [Validators.required, Validators.pattern(/\S/)]),
  });

  protected save(): void {
    this.submitted.set(true);
    const v = this.form.getRawValue();
    if (this.form.invalid || v.target === null) return;
    this.busy.set(true);
    this.api.addAdjustment(this.account.id, { targetBalance: v.target, date: v.date, reason: v.reason.trim() }).subscribe({
      next: () => { this.toast.success('Balance adjusted'); this.context.completeWith(true); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}

@Component({
  selector: 'sm-transfer-dialog',
  imports: [ReactiveFormsModule, AmountInputComponent, SelectComponent, DateInputComponent, TimeInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
      <div>
        <h2 class="m-0 text-lg font-semibold">Transfer between accounts</h2>
        <p class="m-0 mt-1 text-sm text-muted">Moves money between your accounts. Transfers are not income or expenses. To pay a credit card, transfer to the card.</p>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="field-label" for="tr-from">From</label>
          <sm-select inputId="tr-from" formControlName="from" [options]="accountOpts()" />
        </div>
        <div>
          <label class="field-label" for="tr-to">To</label>
          <sm-select inputId="tr-to" formControlName="to" [options]="accountOpts()" />
        </div>
      </div>
      @if (sameAccount()) { <div class="error-text">Choose two different accounts.</div> }
      <div>
        <label class="field-label" for="tr-amt">Amount *</label>
        <sm-amount-input inputId="tr-amt" formControlName="amount" [invalid]="submitted() && form.controls.amount.invalid" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label" for="tr-date">Date</label><sm-date inputId="tr-date" formControlName="date" /></div>
        <div><label class="field-label" for="tr-time">Time</label><sm-time inputId="tr-time" formControlName="time" /></div>
      </div>
      <div>
        <label class="field-label" for="tr-note">Note</label>
        <input id="tr-note" class="input" formControlName="note" maxlength="500" placeholder="Optional" />
      </div>
      <div class="dialog-actions justify-end">
        <button type="button" class="btn" (click)="context.completeWith(false)">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">Transfer</button>
      </div>
    </form>
  `,
})
export class TransferDialog {
  readonly context = injectContext<TuiDialogContext<boolean, { fromAccountId?: string } | undefined>>();
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(TransactionsApi);
  private readonly ref = inject(RefData);
  private readonly settings = inject(SettingsStore);
  private readonly toast = inject(Toast);
  protected readonly accounts = this.ref.activeAccounts;
  protected readonly accountOpts = computed(() => this.accounts().map((a) => ({ value: a.id, label: a.name })));
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    from: this.fb.control(this.context.data?.fromAccountId ?? this.ref.defaultAccount()?.id ?? ''),
    to: this.fb.control(this.ref.activeAccounts().find((a) => a.id !== (this.context.data?.fromAccountId ?? this.ref.defaultAccount()?.id))?.id ?? ''),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    date: this.fb.control(dateKey(new Date(), this.settings.tz())),
    time: this.fb.control(timeKey(new Date(), this.settings.tz())),
    note: this.fb.control(''),
  });
  protected sameAccount = () => this.form.controls.from.value === this.form.controls.to.value;

  protected save(): void {
    this.submitted.set(true);
    const v = this.form.getRawValue();
    if (this.form.invalid || this.sameAccount()) return;
    this.busy.set(true);
    this.api.createTransfer({
      fromAccountId: v.from, toAccountId: v.to, amount: v.amount!, note: v.note.trim() || undefined,
      occurredAt: zonedToUtc(v.date, v.time || '00:00', this.settings.tz()).toISOString(),
    }).subscribe({
      next: () => { this.toast.success('Transfer recorded'); this.context.completeWith(true); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}
