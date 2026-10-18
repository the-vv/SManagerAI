import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TuiSwitch } from '@taiga-ui/kit';
import { AuthService } from '../../core/auth/auth.service';
import { DATE_FORMATS, formatDateParts } from '../../core/format/datetime';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { Toast } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { PageHeaderComponent } from '../../shared/components/ui.components';
import { SessionInfo, Settings } from '../../shared/models/api.models';
import { CURRENCIES, LOCALES, TIMEZONES } from '../../shared/models/constants';
import { SmDatePipe } from '../../shared/pipes/format.pipes';
import { AccountsApi } from '../accounts/accounts.api';
import { InvitesSection } from './invites.section';
import { SelectComponent } from '../../shared/components/select.component';

@Component({
  selector: 'sm-settings-page',
  imports: [PageHeaderComponent, ReactiveFormsModule, TuiSwitch, SmDatePipe, RouterLink, SelectComponent, InvitesSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sm-page-header title="Settings" />
    <div class="grid max-w-3xl gap-4">
      <form class="card card-pad rise flex flex-col gap-4" [formGroup]="form" (ngSubmit)="save()">
        <h2 class="m-0 text-base font-semibold">Preferences</h2>

        <div>
          <span class="field-label">Theme</span>
          <div class="seg mt-1" role="group" aria-label="Theme">
            <button type="button" [attr.aria-pressed]="form.controls.theme.value === 'dark'" (click)="setTheme('dark')">Dark</button>
            <button type="button" [attr.aria-pressed]="form.controls.theme.value === 'light'" (click)="setTheme('light')">Light</button>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="field-label" for="s-acc">Default account</label>
            <sm-select inputId="s-acc" [options]="accountOpts()" [value]="defaultId()" (valueChange)="setDefault($event ?? '')" />
          </div>
          <div>
            <label class="field-label" for="s-cur">Currency</label>
            <sm-select inputId="s-cur" formControlName="currency" [options]="currencies" />
          </div>
          <div>
            <label class="field-label" for="s-loc">Number format</label>
            <sm-select inputId="s-loc" formControlName="locale" [options]="locales" />
          </div>
          <div>
            <label class="field-label" for="s-tz">Timezone</label>
            <sm-select inputId="s-tz" formControlName="timezone" [options]="tzOpts()" />
          </div>
          <div>
            <label class="field-label" for="s-df">Date format</label>
            <sm-select inputId="s-df" formControlName="dateFormat" [options]="dfOpts()" />
          </div>
          <div>
            <label class="field-label" for="s-tf">Time format</label>
            <sm-select inputId="s-tf" formControlName="timeFormat" [options]="timeFormatOpts" />
          </div>
          <div>
            <label class="field-label" for="s-kind">New transaction defaults to</label>
            <sm-select inputId="s-kind" formControlName="defaultTxKind" [options]="kindOpts" />
          </div>
          <div>
            <label class="field-label" for="s-mode">New automations default to</label>
            <sm-select inputId="s-mode" formControlName="defaultAutomationMode" [options]="modeOpts" />
          </div>
          <div>
            <label class="field-label" for="s-rem">Heads-up reminder (days before due)</label>
            <input id="s-rem" type="number" min="0" max="30" class="input" formControlName="reminderDaysBefore" />
          </div>
        </div>

        <label class="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
          <span>Use category colours <span class="block text-xs font-normal text-muted">Tint transactions and charts with each category’s colour</span></span>
          <input type="checkbox" tuiSwitch formControlName="useCategoryColors" />
        </label>

        <div class="flex justify-end"><button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save preferences' }}</button></div>
      </form>

      <section class="card card-pad rise">
        <h2 class="m-0 mb-2 text-base font-semibold">Export &amp; backup</h2>
        <p class="m-0 text-sm text-muted">
          Export transactions or any report to CSV from the <a routerLink="/transactions">Transactions</a> and <a routerLink="/reports">Reports</a> pages.
        </p>
      </section>

      @if (auth.user()?.isAdmin) { <sm-invites-section /> }

      <section class="card card-pad rise">
        <h2 class="m-0 mb-3 text-base font-semibold">Sessions</h2>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          @for (s of sessions(); track s.id) {
            <li class="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{{ shortAgent(s.userAgent) }} @if (s.current) { <span class="chip ml-1 text-accent">This device</span> }</div>
                <div class="text-xs text-muted">Last used {{ s.lastUsedAt | smDate: true }} · expires {{ s.expiresAt | smDate }}</div>
              </div>
              @if (!s.current) { <button type="button" class="btn btn-sm" (click)="revoke(s)">Sign out</button> }
            </li>
          }
        </ul>
        @if (sessions().length > 1) { <button type="button" class="btn btn-sm mt-3" (click)="revokeOthers()">Sign out all other sessions</button> }
      </section>

      <form class="card card-pad rise flex flex-col gap-3" [formGroup]="pwd" (ngSubmit)="changePassword()">
        <h2 class="m-0 text-base font-semibold">Account</h2>
        <p class="m-0 text-sm text-muted">Signed in as <b class="text-fg">{{ auth.user()?.email }}</b></p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="field-label" for="pw-cur">Current password</label><input id="pw-cur" type="password" autocomplete="current-password" class="input" formControlName="current" /></div>
          <div><label class="field-label" for="pw-new">New password (10+ characters)</label><input id="pw-new" type="password" autocomplete="new-password" class="input" formControlName="next" /></div>
        </div>
        <div class="flex flex-wrap justify-between gap-2">
          <button type="button" class="btn" (click)="auth.logout()">Sign out</button>
          <button type="submit" class="btn btn-primary" [disabled]="pwd.invalid || pwdBusy()">Change password</button>
        </div>
      </form>
    </div>
  `,
})
export class SettingsPage {
  protected readonly accountOpts = computed(() => this.ref.activeAccounts().map((a) => ({ value: a.id, label: a.name })));
  protected readonly tzOpts = computed(() => this.timezoneList().map((t) => ({ value: t, label: t })));
  protected readonly dfOpts = computed(() => DATE_FORMATS.map((f) => ({ value: f, label: this.sample(f) })));
  protected readonly timeFormatOpts = [{ value: '12h' as const, label: '12-hour (3:30 PM)' }, { value: '24h' as const, label: '24-hour (15:30)' }];
  protected readonly kindOpts = [{ value: 'EXPENSE' as const, label: 'Expense' }, { value: 'INCOME' as const, label: 'Income' }];
  protected readonly modeOpts = [{ value: 'REMINDER' as const, label: 'Remind me' }, { value: 'AUTO' as const, label: 'Record automatically' }];
  protected readonly ref = inject(RefData);
  protected readonly auth = inject(AuthService);
  private readonly store = inject(SettingsStore);
  private readonly accountsApi = inject(AccountsApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly defaultId = computed(() => this.ref.defaultAccount()?.id ?? '');
  protected readonly currencies = CURRENCIES;
  protected readonly locales = LOCALES;
  protected readonly dateFormats = DATE_FORMATS;
  protected readonly busy = signal(false);
  protected readonly pwdBusy = signal(false);
  protected readonly sessions = signal<SessionInfo[]>([]);

  protected readonly form = this.fb.group({
    theme: this.fb.control<'dark' | 'light'>(this.store.settings().theme),
    currency: this.fb.control(this.store.settings().currency),
    locale: this.fb.control(this.store.settings().locale),
    timezone: this.fb.control(this.store.settings().timezone),
    dateFormat: this.fb.control(this.store.settings().dateFormat),
    timeFormat: this.fb.control<'12h' | '24h'>(this.store.settings().timeFormat),
    useCategoryColors: this.fb.control(this.store.settings().useCategoryColors),
    defaultTxKind: this.fb.control<'INCOME' | 'EXPENSE'>(this.store.settings().defaultTxKind),
    defaultAutomationMode: this.fb.control<'AUTO' | 'REMINDER'>(this.store.settings().defaultAutomationMode),
    reminderDaysBefore: this.fb.control(this.store.settings().reminderDaysBefore, [Validators.min(0), Validators.max(30)]),
  });
  protected readonly pwd = this.fb.group({
    current: this.fb.control('', Validators.required),
    next: this.fb.control('', [Validators.required, Validators.minLength(10)]),
  });

  constructor() { this.loadSessions(); }

  protected timezoneList(): string[] {
    const cur = this.store.settings().timezone;
    return TIMEZONES.includes(cur) ? TIMEZONES : [cur, ...TIMEZONES];
  }
  protected sample(f: string): string { return formatDateParts({ year: 2026, month: 3, day: 7 }, f); }
  protected setTheme(t: 'dark' | 'light'): void { this.form.controls.theme.setValue(t); this.store.theme.set(t); }

  protected save(): void {
    this.busy.set(true);
    this.store.update(this.form.getRawValue() as Partial<Settings>).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Preferences saved'); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }

  protected setDefault(id: string): void {
    this.accountsApi.setDefault(id).subscribe({
      next: () => { this.toast.success('Default account updated'); this.ref.refreshAccounts().subscribe(); },
      error: (e) => this.toast.error(e),
    });
  }

  private loadSessions(): void { this.auth.sessions().subscribe({ next: (s) => this.sessions.set(s) }); }
  protected shortAgent(ua: string | null): string {
    if (!ua) return 'Unknown device';
    const browser = /(Edg|Chrome|Firefox|Safari)\//.exec(ua)?.[1] ?? 'Browser';
    const os = /(Android|iPhone|iPad|Windows|Mac OS X|Linux)/.exec(ua)?.[1] ?? '';
    return `${browser === 'Edg' ? 'Edge' : browser} on ${os.replace('Mac OS X', 'macOS')}`.trim();
  }
  protected revoke(s: SessionInfo): void {
    this.auth.revokeSession(s.id).subscribe({ next: () => { this.toast.success('Session signed out'); this.loadSessions(); }, error: (e) => this.toast.error(e) });
  }
  protected async revokeOthers(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Sign out other sessions?', message: 'All other browsers and devices will need to sign in again.', confirmLabel: 'Sign out others', danger: true }))) return;
    this.auth.revokeOthers().subscribe({ next: () => { this.toast.success('Other sessions signed out'); this.loadSessions(); }, error: (e) => this.toast.error(e) });
  }
  protected changePassword(): void {
    const v = this.pwd.getRawValue();
    this.pwdBusy.set(true);
    this.auth.changePassword(v.current, v.next).subscribe({
      next: () => { this.pwdBusy.set(false); this.pwd.reset(); this.toast.success('Password changed. Other sessions were signed out.'); this.loadSessions(); },
      error: (e) => { this.pwdBusy.set(false); this.toast.error(e); },
    });
  }
}
