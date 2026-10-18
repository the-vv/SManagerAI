import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { Automation, AutomationMode, Execution, Frequency, IntervalUnit, UpcomingItem } from '../../shared/models/api.models';

export interface AutomationInput {
  title: string; kind: 'INCOME' | 'EXPENSE'; amount: number; accountId: string; categoryId?: string | null;
  description?: string | null; frequency: Frequency; customEvery?: number | null; customUnit?: IntervalUnit | null;
  dayOfMonth?: number | null; startDate: string; endDate?: string | null; mode: AutomationMode;
  reminderDaysBefore?: number; backfill?: boolean; isEnabled?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AutomationsApi {
  private readonly api = inject(ApiClient);
  list(): Observable<Automation[]> { return this.api.get('/automations'); }
  upcoming(days = 60): Observable<UpcomingItem[]> { return this.api.get('/automations/upcoming', { days }); }
  pending(): Observable<Execution[]> { return this.api.get('/automations/pending'); }
  executions(id: string): Observable<Execution[]> { return this.api.get(`/automations/${id}/executions`); }
  create(b: AutomationInput): Observable<Automation> { return this.api.post('/automations', b); }
  update(id: string, b: Partial<AutomationInput>): Observable<Automation> { return this.api.patch(`/automations/${id}`, b); }
  remove(id: string): Observable<void> { return this.api.delete(`/automations/${id}`); }
  confirm(executionId: string, b: { amount?: number; date?: string } = {}): Observable<void> { return this.api.post(`/automations/executions/${executionId}/confirm`, b); }
  skip(executionId: string): Observable<void> { return this.api.post(`/automations/executions/${executionId}/skip`); }
}
