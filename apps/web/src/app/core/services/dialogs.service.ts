import { Injectable, inject } from '@angular/core';
import { tuiDialog } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { AccountFormDialog } from '../../features/accounts/account-form.dialog';
import { AdjustDialog, TransferDialog } from '../../features/accounts/adjust-transfer.dialogs';
import { AutomationFormDialog } from '../../features/automations/automation-form.dialog';
import { CategoryFormDialog } from '../../features/categories/category-form.dialog';
import { TransactionFormDialog, TxFormData } from '../../features/transactions/transaction-form.dialog';
import { Account, Automation, Category, Transaction } from '../../shared/models/api.models';
import { RefData } from './ref-data.store';

/** Opens the app's modal forms. Every method resolves to `true` when something was saved. */
@Injectable({ providedIn: 'root' })
export class Dialogs {
  private readonly ref = inject(RefData);
  private readonly api = inject(ApiClient);
  private readonly txDialog = tuiDialog(TransactionFormDialog, { size: 'm', closable: true, dismissible: true });
  private readonly accountDialog = tuiDialog(AccountFormDialog, { size: 'm', closable: true, dismissible: true });
  private readonly adjustDialog = tuiDialog(AdjustDialog, { size: 's', closable: true, dismissible: true });
  private readonly transferDialog = tuiDialog(TransferDialog, { size: 'm', closable: true, dismissible: true });
  private readonly categoryDialog = tuiDialog(CategoryFormDialog, { size: 's', closable: true, dismissible: true });
  private readonly automationDialog = tuiDialog(AutomationFormDialog, { size: 'm', closable: true, dismissible: true });

  private async run(open: Promise<boolean | undefined>, refresh: () => Promise<unknown> | void): Promise<boolean> {
    const saved = (await open) === true;
    if (saved) await refresh();
    return saved;
  }

  private refreshAll() {
    return firstValueFrom(this.ref.loadAll());
  }

  transaction(data: TxFormData = {}): Promise<boolean> {
    return this.run(firstValueFrom(this.txDialog(data), { defaultValue: false }), () => this.refreshAll());
  }
  editTransaction(transaction: Transaction): Promise<boolean> { return this.transaction({ transaction }); }
  async editTransactionById(id: string): Promise<boolean> {
    const transaction = await firstValueFrom(this.api.get<Transaction>(`/transactions/${id}`), { defaultValue: undefined });
    return transaction ? this.editTransaction(transaction) : false;
  }

  account(account?: Account): Promise<boolean> {
    return this.run(firstValueFrom(this.accountDialog(account), { defaultValue: false }), () => this.refreshAll());
  }
  adjust(account: Account): Promise<boolean> {
    return this.run(firstValueFrom(this.adjustDialog(account), { defaultValue: false }), () => this.refreshAll());
  }
  transfer(data?: { fromAccountId?: string }): Promise<boolean> {
    return this.run(firstValueFrom(this.transferDialog(data), { defaultValue: false }), () => this.refreshAll());
  }
  category(data: { category?: Category; type?: 'INCOME' | 'EXPENSE' } = {}): Promise<boolean> {
    return this.run(firstValueFrom(this.categoryDialog(data), { defaultValue: false }), () => this.refreshAll());
  }
  automation(automation?: Automation): Promise<boolean> {
    return this.run(firstValueFrom(this.automationDialog(automation), { defaultValue: false }), () => this.refreshAll());
  }
}
