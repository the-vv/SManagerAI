import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TuiDialogContext, TuiIcon } from '@taiga-ui/core';
import { TuiSwitch } from '@taiga-ui/kit';
import { injectContext } from '@taiga-ui/polymorpheus';
import { zonedToUtc, dateKey, timeKey } from '../../core/format/datetime';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { Toast } from '../../core/services/toast.service';
import { AmountInputComponent } from '../../shared/components/amount-input.component';
import { ConfirmService } from '../../shared/components/confirm.service';
import { FREQUENCIES } from '../../shared/models/constants';
import { Frequency, Transaction } from '../../shared/models/api.models';
import { TransactionsApi, TxInput } from './transactions.api';

export interface TxFormData {
  transaction?: Transaction;
  kind?: 'INCOME' | 'EXPENSE';
  accountId?: string;
}

@Component({
  selector: 'sm-transaction-form',
  imports: [ReactiveFormsModule, AmountInputComponent, TuiIcon, TuiSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
      <div class="flex items-center justify-between gap-3">
        <h2 class="m-0 text-lg font-semibold">{{ editing ? 'Edit transaction' : 'New transaction' }}</h2>
        <div class="seg" role="group" aria-label="Transaction type">
          <button type="button" [attr.aria-pressed]="kind() === 'EXPENSE'" (click)="setKind('EXPENSE')">Expense</button>
          <button type="button" [attr.aria-pressed]="kind() === 'INCOME'" (click)="setKind('INCOME')">Income</button>
        </div>
      </div>

      <div>
        <label class="field-label" for="tx-amount">Amount *</label>
        <sm-amount-input inputId="tx-amount" formControlName="amount" [autoFocus]="!editing" [invalid]="submitted() && form.controls.amount.invalid" />
        @if (submitted() && form.controls.amount.invalid) { <div class="error-text">Enter an amount greater than zero.</div> }
      </div>

      <div>
        <label class="field-label" for="tx-title">Title *</label>
        <input id="tx-title" class="input" formControlName="title" maxlength="120" autocomplete="off"
          placeholder="e.g. Groceries at Big Bazaar" [class.invalid]="submitted() && form.controls.title.invalid" />
        @if (submitted() && form.controls.title.invalid) { <div class="error-text">Title is required.</div> }
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="field-label" for="tx-cat">Category</label>
          <select id="tx-cat" class="input" formControlName="categoryId">
            <option [ngValue]="null">Uncategorized</option>
            @for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
          </select>
        </div>
        <div>
          <label class="field-label" for="tx-acc">Account</label>
          <select id="tx-acc" class="input" formControlName="accountId">
            @for (a of accounts(); track a.id) { <option [ngValue]="a.id">{{ a.name }}</option> }
          </select>
        </div>
        <div>
          <label class="field-label" for="tx-date">Date</label>
          <input id="tx-date" type="date" class="input" formControlName="date" [class.invalid]="submitted() && form.controls.date.invalid" />
        </div>
        <div>
          <label class="field-label" for="tx-time">Time</label>
          <input id="tx-time" type="time" class="input" formControlName="time" />
        </div>
      </div>

      <div>
        <label class="field-label" for="tx-notes">Notes</label>
        <textarea id="tx-notes" class="input" formControlName="notes" maxlength="1000" placeholder="Optional"></textarea>
      </div>

      @if (!editing) {
        <div class="rounded-xl border border-line bg-surface-2 p-3">
          <label class="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
            <span class="flex items-center gap-2"><tui-icon icon="@tui.repeat" /> Repeat this transaction</span>
            <input type="checkbox" tuiSwitch formControlName="recurring" />
          </label>
          @if (form.controls.recurring.value) {
            <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="field-label" for="tx-freq">Frequency</label>
                <select id="tx-freq" class="input" formControlName="frequency">
                  @for (f of frequencies; track f.value) { @if (f.value !== 'CUSTOM') { <option [value]="f.value">{{ f.label }}</option> } }
                </select>
              </div>
              <div>
                <label class="field-label" for="tx-mode">When due</label>
                <select id="tx-mode" class="input" formControlName="mode">
                  <option value="REMINDER">Remind me to confirm</option>
                  <option value="AUTO">Record automatically</option>
                </select>
              </div>
            </div>
            <p class="m-0 mt-2 text-xs text-muted">
              This only records or reminds you – no real bank transfer or auto-debit is made. This transaction counts as the first occurrence.
            </p>
          }
        </div>
      }

      <div class="dialog-actions justify-between">
        @if (editing) {
          <button type="button" class="btn btn-danger" (click)="remove()" [disabled]="busy()"><tui-icon icon="@tui.trash" /> Delete</button>
        } @else { <span></span> }
        <div class="flex gap-2">
          <button type="button" class="btn" (click)="context.completeWith(false)">Cancel</button>
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
        </div>
      </div>
    </form>
  `,
})
export class TransactionFormDialog {
  readonly context = injectContext<TuiDialogContext<boolean, TxFormData>>();
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(TransactionsApi);
  private readonly ref = inject(RefData);
  private readonly settings = inject(SettingsStore);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(ConfirmService);

  protected readonly editing = !!this.context.data?.transaction;
  protected readonly frequencies = FREQUENCIES;
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly accounts = this.ref.activeAccounts;

  protected readonly form = this.fb.group({
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    title: this.fb.control('', [Validators.required, Validators.pattern(/\S/)]),
    categoryId: this.fb.control<string | null>(null),
    accountId: this.fb.control('', Validators.required),
    date: this.fb.control('', Validators.required),
    time: this.fb.control('00:00'),
    notes: this.fb.control(''),
    recurring: this.fb.control(false),
    frequency: this.fb.control<Frequency>('MONTHLY'),
    mode: this.fb.control<'AUTO' | 'REMINDER'>(this.settings.settings().defaultAutomationMode),
  });

  protected readonly kind = signal<'INCOME' | 'EXPENSE'>(this.context.data?.kind ?? this.settings.settings().defaultTxKind);
  protected readonly categories = computed(() => (this.kind() === 'INCOME' ? this.ref.incomeCategories() : this.ref.expenseCategories()));

  constructor() {
    const tx = this.context.data?.transaction;
    const tz = this.settings.tz();
    const now = new Date();
    if (tx) {
      this.kind.set(tx.kind === 'INCOME' ? 'INCOME' : 'EXPENSE');
      this.form.patchValue({
        amount: tx.amount, title: tx.title, categoryId: tx.category?.id ?? null, accountId: tx.account.id,
        date: dateKey(tx.occurredAt, tz), time: timeKey(tx.occurredAt, tz), notes: tx.notes ?? '',
      });
    } else {
      this.form.patchValue({
        accountId: this.context.data?.accountId ?? this.ref.defaultAccount()?.id ?? '',
        date: dateKey(now, tz), time: timeKey(now, tz),
      });
    }
    effect(() => {
      // a category from the other direction is no longer valid when switching Income/Expense
      const valid = this.categories().some((c) => c.id === this.form.controls.categoryId.value);
      if (!valid && this.form.controls.categoryId.value !== null) this.form.controls.categoryId.setValue(null);
    });
  }

  protected setKind(k: 'INCOME' | 'EXPENSE'): void { this.kind.set(k); }

  protected save(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const occurredAt = zonedToUtc(v.date, v.time || '00:00', this.settings.tz()).toISOString();
    const body: TxInput = {
      title: v.title.trim(), amount: v.amount!, kind: this.kind(), categoryId: v.categoryId,
      accountId: v.accountId, occurredAt, notes: v.notes.trim() || (this.editing ? null : undefined),
    };
    if (!this.editing && v.recurring) body.automation = { frequency: v.frequency, mode: v.mode };
    this.busy.set(true);
    const req = this.editing ? this.api.update(this.context.data!.transaction!.id, body) : this.api.create(body);
    req.subscribe({
      next: () => {
        this.toast.success(this.editing ? 'Transaction updated' : 'Transaction added');
        this.context.completeWith(true);
      },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }

  protected async remove(): Promise<void> {
    const tx = this.context.data!.transaction!;
    if (!(await this.confirm.ask({ title: 'Delete transaction?', message: `“${tx.title}” will be removed and balances will be recalculated.`, confirmLabel: 'Delete', danger: true }))) return;
    this.busy.set(true);
    this.api.remove(tx.id).subscribe({
      next: () => { this.toast.success('Transaction deleted'); this.context.completeWith(true); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}

