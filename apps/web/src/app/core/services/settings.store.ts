import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { TUI_DARK_MODE } from '@taiga-ui/core';
import { Observable, tap } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { DATE_FORMATS, dateKey, formatDate, formatDateKey, formatTime, monthKey, todayKey } from '../format/datetime';
import { formatMoney } from '../format/money';
import { Settings } from '../../shared/models/api.models';

export const DEFAULT_SETTINGS: Settings = {
  currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata', theme: 'dark', dateFormat: 'dd MMM yyyy',
  timeFormat: '12h', useCategoryColors: true, defaultTxKind: 'EXPENSE', defaultAutomationMode: 'REMINDER',
  reminderDaysBefore: 2,
};

const THEME_KEY = 'sm-theme';

/** User preferences + formatting helpers + theme. Dark by default; the choice is also cached locally so there is no flash. */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly api = inject(ApiClient);
  private readonly tuiDark = inject(TUI_DARK_MODE);

  readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly theme = signal<'dark' | 'light'>(this.readCachedTheme());

  readonly tz = computed(() => this.settings().timezone);
  readonly currencySymbol = computed(() =>
    (new Intl.NumberFormat(this.settings().locale, { style: 'currency', currency: this.settings().currency })
      .formatToParts(0).find((p) => p.type === 'currency')?.value ?? ''));
  readonly dateFormats = DATE_FORMATS;

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.setAttribute('data-theme', t);
      this.tuiDark.set(t === 'dark');
      try { localStorage.setItem(THEME_KEY, t); } catch { /* storage unavailable */ }
    });
  }

  private readCachedTheme(): 'dark' | 'light' {
    try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  }

  load(): Observable<Settings> {
    return this.api.get<Settings>('/settings').pipe(tap((s) => { this.settings.set(s); this.theme.set(s.theme); }));
  }

  update(patch: Partial<Settings>): Observable<Settings> {
    return this.api.patch<Settings>('/settings', patch).pipe(tap((s) => { this.settings.set(s); this.theme.set(s.theme); }));
  }

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.api.patch<Settings>('/settings', { theme: next }).subscribe({ error: () => undefined });
    this.settings.update((s) => ({ ...s, theme: next }));
  }

  // ---- formatting -------------------------------------------------------
  money(minor: number, opts: { compact?: boolean; sign?: boolean } = {}): string {
    const s = this.settings();
    return formatMoney(minor, { locale: s.locale, currency: s.currency }, opts);
  }
  date(iso: string): string { return formatDate(iso, this.tz(), this.settings().dateFormat); }
  time(iso: string): string { return formatTime(iso, this.tz(), this.settings().timeFormat); }
  dateTime(iso: string): string { return `${this.date(iso)}, ${this.time(iso)}`; }
  dateOfKey(key: string): string { return formatDateKey(key, this.settings().dateFormat); }
  dayKey(iso: string): string { return dateKey(iso, this.tz()); }
  monthOf(iso: string): string { return monthKey(iso, this.tz()); }
  today(): string { return todayKey(this.tz()); }
  thisMonth(): string { return this.today().slice(0, 7); }
}
