import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TuiDialogContext } from '@taiga-ui/core';
import { TuiSwitch } from '@taiga-ui/kit';
import { injectContext } from '@taiga-ui/polymorpheus';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { Toast } from '../../core/services/toast.service';
import { AmountInputComponent } from '../../shared/components/amount-input.component';
import { ColorPickerComponent, IconPickerComponent } from '../../shared/components/pickers.component';
import { ACCOUNT_TYPES } from '../../shared/models/constants';
import { Account, AccountType } from '../../shared/models/api.models';
import { AccountsApi } from './accounts.api';
import { SelectComponent } from '../../shared/components/select.component';
import { DateInputComponent } from '../../shared/components/date-input.component';

@Component({
  selector: 'sm-account-form',
  imports: [ReactiveFormsModule, AmountInputComponent, ColorPickerComponent, IconPickerComponent, TuiSwitch, SelectComponent, DateInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
      <h2 class="m-0 text-lg font-semibold">{{ account ? 'Edit account' : 'New account' }}</h2>

      <div>
        <label class="field-label" for="ac-name">Account name *</label>
        <input id="ac-name" class="input" formControlName="name" maxlength="80" placeholder="e.g. HDFC Salary"
          [class.invalid]="submitted() && form.controls.name.invalid" />
        @if (submitted() && form.controls.name.invalid) { <div class="error-text">Name is required.</div> }
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="field-label" for="ac-type">Type</label>
          <sm-select inputId="ac-type" formControlName="type" [options]="types" />
        </div>
        <div>
          <label class="field-label" for="ac-inst">Bank / institution</label>
          <input id="ac-inst" class="input" formControlName="institution" maxlength="80" />
        </div>
        <div>
          <label class="field-label" for="ac-id">Last 4 digits / identifier</label>
          <input id="ac-id" class="input" formControlName="identifier" maxlength="20" />
        </div>
        <div>
          <label class="field-label" for="ac-date">Opening date</label>
          <sm-date inputId="ac-date" formControlName="openingDate" />
        </div>
      </div>

      <div>
        <label class="field-label" for="ac-open">{{ isCard() ? 'Amount currently owed (opening)' : 'Opening balance' }}</label>
        <sm-amount-input inputId="ac-open" formControlName="opening" [allowNegative]="!isCard()" />
        <p class="m-0 mt-1 text-xs text-muted">
          @if (isCard()) { Enter what you owe on the card today. It is tracked as a liability and never counted as spendable cash. }
          @else { The balance on the opening date. Later transactions are added on top of it. }
        </p>
      </div>

      <div>
        <span class="field-label">Colour</span>
        <sm-color-picker formControlName="color" />
      </div>
      <div>
        <span class="field-label">Icon</span>
        <sm-icon-picker formControlName="icon" />
      </div>

      <div class="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-3">
        <label class="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
          <span>Default account <span class="block text-xs font-normal text-muted">Pre-selected for new transactions</span></span>
          <input type="checkbox" tuiSwitch formControlName="isDefault" />
        </label>
        @if (account) {
          <label class="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
            <span>Active <span class="block text-xs font-normal text-muted">Inactive accounts keep their history but cannot receive new entries</span></span>
            <input type="checkbox" tuiSwitch formControlName="isActive" />
          </label>
        }
      </div>

      <div class="dialog-actions justify-end">
        <button type="button" class="btn" (click)="context.completeWith(false)">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  `,
})
export class AccountFormDialog {
  readonly context = injectContext<TuiDialogContext<boolean, Account | undefined>>();
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AccountsApi);
  private readonly ref = inject(RefData);
  private readonly settings = inject(SettingsStore);
  private readonly toast = inject(Toast);

  protected readonly account = this.context.data;
  protected readonly types = ACCOUNT_TYPES;
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.pattern(/\S/)]),
    type: this.fb.control<AccountType>('BANK'),
    institution: this.fb.control(''),
    identifier: this.fb.control(''),
    openingDate: this.fb.control(this.settings.today(), Validators.required),
    opening: this.fb.control<number | null>(0),
    color: this.fb.control<string | null>(null),
    icon: this.fb.control<string | null>(null),
    isDefault: this.fb.control(false),
    isActive: this.fb.control(true),
  });
  protected readonly isCardSig = signal(false);
  protected isCard = this.isCardSig.asReadonly();

  constructor() {
    const a = this.account;
    if (a) {
      this.form.patchValue({
        name: a.name, type: a.type, institution: a.institution ?? '', identifier: a.identifier ?? '',
        openingDate: a.openingDate, opening: a.type === 'CREDIT_CARD' ? -a.openingBalance : a.openingBalance,
        color: a.color, icon: a.icon, isDefault: a.isDefault, isActive: a.isActive,
      });
      this.isCardSig.set(a.type === 'CREDIT_CARD');
    } else {
      this.form.patchValue({ isDefault: this.ref.activeAccounts().length === 0 });
    }
    this.form.controls.type.valueChanges.subscribe((t) => this.isCardSig.set(t === 'CREDIT_CARD'));
  }

  protected save(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const opening = v.opening ?? 0;
    const body = {
      name: v.name.trim(), type: v.type, institution: v.institution.trim() || null,
      identifier: v.identifier.trim() || null, openingDate: v.openingDate,
      // credit cards: the user enters what they owe, we store the (negative) balance
      openingBalance: v.type === 'CREDIT_CARD' ? -opening : opening,
      color: v.color, icon: v.icon,
    };
    this.busy.set(true);
    const req = this.account
      ? this.api.update(this.account.id, { ...body, isActive: v.isActive })
      : this.api.create({ ...body, isDefault: v.isDefault });
    req.subscribe({
      next: (saved) => {
        const finish = () => { this.toast.success('Account saved'); this.context.completeWith(true); };
        // making an existing account the default is a separate, atomic endpoint
        if (this.account && v.isDefault && !this.account.isDefault && v.isActive) {
          this.api.setDefault(saved.id).subscribe({ next: finish, error: (e) => { this.busy.set(false); this.toast.error(e); } });
        } else finish();
      },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}
