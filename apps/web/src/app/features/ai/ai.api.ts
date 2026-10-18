import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';

export type AiJobState = 'QUEUED' | 'PROCESSING' | 'SAVED' | 'NEEDS_REVIEW' | 'FAILED';

export interface AiClassification {
  title: string;
  /** minor units; null when the text contained no reliable amount */
  amount: number | null;
  type: 'INCOME' | 'EXPENSE';
  categoryId: string | null;
  confidence: number;
  warnings: string[];
}

export interface AiQueueItem {
  jobId: string;
  state: AiJobState;
  inputText: string;
  result: AiClassification | null;
  error: string | null;
  transaction: { id: string; title: string; amount: number; kind: string; accountName: string; categoryName: string | null } | null;
  queuePosition: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AiAllowance { enabled: boolean; dailyLimit: number; used: number; remaining: number; }

@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly api = inject(ApiClient);

  status(): Observable<AiAllowance> { return this.api.get('/ai/status'); }
  /** @param accountId save to this account instead of the default one */
  classify(text: string, accountId?: string): Observable<{ jobId: string; message: string }> {
    return this.api.post('/ai/transactions/classify', accountId ? { text, accountId } : { text });
  }
  queue(): Observable<AiQueueItem[]> { return this.api.get('/ai/queue'); }
  /** Removes an entry from the queue (waiting entries are cancelled; saved ones are only hidden). */
  remove(jobId: string): Observable<void> { return this.api.delete(`/ai/jobs/${jobId}`); }
  clearDone(): Observable<{ cleared: number }> { return this.api.post('/ai/queue/clear'); }
}
