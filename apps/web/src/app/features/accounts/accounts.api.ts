import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { Account, AccountType, AccountsOverview, Adjustment } from '../../shared/models/api.models';

export interface AccountInput {
  name: string; institution?: string | null; identifier?: string | null; type: AccountType;
  openingBalance?: number; openingDate?: string; isDefault?: boolean; color?: string | null; icon?: string | null;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly api = inject(ApiClient);
  overview(date?: string): Observable<AccountsOverview> { return this.api.get('/accounts', { date }); }
  get(id: string): Observable<Account> { return this.api.get(`/accounts/${id}`); }
  create(b: AccountInput): Observable<Account> { return this.api.post('/accounts', b); }
  update(id: string, b: Partial<AccountInput>): Observable<Account> { return this.api.patch(`/accounts/${id}`, b); }
  setDefault(id: string): Observable<Account> { return this.api.post(`/accounts/${id}/default`); }
  remove(id: string): Observable<void> { return this.api.delete(`/accounts/${id}`); }
  adjustments(id: string): Observable<Adjustment[]> { return this.api.get(`/accounts/${id}/adjustments`); }
  addAdjustment(id: string, b: { reason: string; date?: string; amount?: number; targetBalance?: number }): Observable<Adjustment> {
    return this.api.post(`/accounts/${id}/adjustments`, b);
  }
  removeAdjustment(id: string, adjId: string): Observable<void> { return this.api.delete(`/accounts/${id}/adjustments/${adjId}`); }
}
