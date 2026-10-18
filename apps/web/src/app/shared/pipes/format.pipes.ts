import { Pipe, PipeTransform, inject } from '@angular/core';
import { SettingsStore } from '../../core/services/settings.store';

/** `{{ 123456 | money }}` -> ₹1,234.56 (reads the user's currency/locale). */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly s = inject(SettingsStore);
  transform(minor: number | null | undefined, mode: '' | 'sign' | 'compact' = ''): string {
    if (minor === null || minor === undefined) return '–';
    return this.s.money(minor, { sign: mode === 'sign', compact: mode === 'compact' });
  }
}

@Pipe({ name: 'smDate', pure: false })
export class SmDatePipe implements PipeTransform {
  private readonly s = inject(SettingsStore);
  /** ISO instant, or a 'YYYY-MM-DD' key. */
  transform(v: string | null | undefined, withTime = false): string {
    if (!v) return '–';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return this.s.dateOfKey(v);
    return withTime ? this.s.dateTime(v) : this.s.date(v);
  }
}

@Pipe({ name: 'smTime', pure: false })
export class SmTimePipe implements PipeTransform {
  private readonly s = inject(SettingsStore);
  transform(v: string | null | undefined): string { return v ? this.s.time(v) : ''; }
}

@Pipe({ name: 'pct' })
export class PercentBpPipe implements PipeTransform {
  /** basis points -> "12.5%" */
  transform(bp: number): string { return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`; }
}
