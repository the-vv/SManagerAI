import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, tap } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { Account, AccountsOverview, Category, Notifications } from '../../shared/models/api.models';

/** Reference data used by many screens (accounts, categories, notifications). Loaded once, refreshed after changes. */
@Injectable({ providedIn: 'root' })
export class RefData {
  private readonly api = inject(ApiClient);

  readonly overview = signal<AccountsOverview | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly notifications = signal<Notifications>({ pending: [], dueSoon: [] });
  readonly loaded = signal(false);

  readonly accounts = computed<Account[]>(() => this.overview()?.items ?? []);
  readonly activeAccounts = computed(() => this.accounts().filter((a) => a.isActive));
  readonly defaultAccount = computed(() => this.activeAccounts().find((a) => a.isDefault) ?? this.activeAccounts()[0] ?? null);
  readonly activeCategories = computed(() => this.categories().filter((c) => c.isActive));
  readonly expenseCategories = computed(() => this.activeCategories().filter((c) => c.type === 'EXPENSE'));
  readonly incomeCategories = computed(() => this.activeCategories().filter((c) => c.type === 'INCOME'));
  readonly notificationCount = computed(() => this.notifications().pending.length + this.notifications().dueSoon.length);

  loadAll(): Observable<unknown> {
    return forkJoin([this.refreshAccounts(), this.refreshCategories(), this.refreshNotifications()]).pipe(
      tap(() => this.loaded.set(true)),
    );
  }
  refreshAccounts(): Observable<AccountsOverview> {
    return this.api.get<AccountsOverview>('/accounts').pipe(tap((o) => this.overview.set(o)));
  }
  refreshCategories(): Observable<Category[]> {
    return this.api.get<Category[]>('/categories', { includeInactive: true }).pipe(tap((c) => this.categories.set(c)));
  }
  refreshNotifications(): Observable<Notifications> {
    return this.api.get<Notifications>('/automations/notifications').pipe(tap((n) => this.notifications.set(n)));
  }
  accountById(id: string | null | undefined): Account | undefined { return this.accounts().find((a) => a.id === id); }
  reset(): void {
    this.overview.set(null); this.categories.set([]); this.notifications.set({ pending: [], dueSoon: [] }); this.loaded.set(false);
  }
}
