import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient, Query } from '../../core/api/api.client';
import { Frequency, IntervalUnit, AutomationMode, Transaction, TransactionPage } from '../../shared/models/api.models';

export interface TxQuery extends Query {
  month?: string; from?: string; to?: string; accountId?: string; kind?: string; categoryId?: string;
  origin?: string; q?: string; sort?: string; dir?: string; page?: number; pageSize?: number;
}

export interface TxInput {
  title: string; amount: number; kind: 'INCOME' | 'EXPENSE'; categoryId?: string | null; accountId?: string;
  occurredAt?: string; notes?: string | null;
  automation?: { frequency: Frequency; customEvery?: number; customUnit?: IntervalUnit; endDate?: string; mode?: AutomationMode };
}

export interface TransferInput { fromAccountId: string; toAccountId: string; amount: number; occurredAt?: string; note?: string | null; }

@Injectable({ providedIn: 'root' })
export class TransactionsApi {
  private readonly api = inject(ApiClient);

  list(q: TxQuery): Observable<TransactionPage> { return this.api.get('/transactions', q); }
  create(body: TxInput): Observable<Transaction> { return this.api.post('/transactions', body); }
  update(id: string, body: Partial<TxInput>): Observable<Transaction> { return this.api.patch(`/transactions/${id}`, body); }
  remove(id: string): Observable<void> { return this.api.delete(`/transactions/${id}`); }
  exportCsv(q: TxQuery): Observable<Blob> { return this.api.text('/transactions/export.csv', q); }

  createTransfer(body: TransferInput) { return this.api.post<{ id: string }>('/transfers', body); }
  updateTransfer(id: string, body: Partial<TransferInput>) { return this.api.patch<{ id: string }>(`/transfers/${id}`, body); }
  removeTransfer(id: string): Observable<void> { return this.api.delete(`/transfers/${id}`); }
}
