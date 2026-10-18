import { Injectable, inject } from '@angular/core';

const TOP_CENTER = { block: 'start', inline: 'center' } as const;
import { TuiNotificationService } from '@taiga-ui/core';
import { ApiError } from '../api/api.client';

@Injectable({ providedIn: 'root' })
export class Toast {
  private readonly alerts = inject(TuiNotificationService);

  success(message: string): void {
    this.alerts.open(message, { appearance: 'positive', autoClose: 3000, ...TOP_CENTER }).subscribe();
  }
  info(message: string): void {
    this.alerts.open(message, { appearance: 'info', autoClose: 3500, ...TOP_CENTER }).subscribe();
  }
  error(e: unknown, fallback = 'Something went wrong'): void {
    const message = e instanceof ApiError ? e.message : fallback;
    const details = e instanceof ApiError && e.details.length ? `: ${e.details[0]}` : '';
    this.alerts.open(`${message}${details}`, { appearance: 'negative', autoClose: 6000, ...TOP_CENTER }).subscribe();
  }
}
