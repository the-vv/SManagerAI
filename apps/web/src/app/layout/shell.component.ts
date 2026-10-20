import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { AuthService } from '../core/auth/auth.service';
import { Dialogs } from '../core/services/dialogs.service';
import { RefData } from '../core/services/ref-data.store';
import { SettingsStore } from '../core/services/settings.store';
import { MoneyPipe, SmDatePipe } from '../shared/pipes/format.pipes';

interface NavItem { path: string; label: string; icon: string; }

const NAV: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '@tui.layout-dashboard' },
  { path: '/transactions', label: 'Transactions', icon: '@tui.arrow-left-right' },
  { path: '/accounts', label: 'Accounts', icon: '@tui.wallet' },
  { path: '/categories', label: 'Categories', icon: '@tui.tags' },
  { path: '/events', label: 'Events', icon: '@tui.map-pin' },
  { path: '/automations', label: 'Automations', icon: '@tui.repeat' },
  { path: '/reports', label: 'Reports', icon: '@tui.chart-column' },
  { path: '/settings', label: 'Settings', icon: '@tui.settings' },
];

const COLLAPSE_KEY = 'sm-sidebar-collapsed';

@Component({
  selector: 'sm-shell',
  imports: [NgTemplateOutlet, RouterOutlet, RouterLink, RouterLinkActive, TuiIcon, MoneyPipe, SmDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-white">Skip to content</a>

    <!-- Desktop sidebar -->
    <aside class="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-elevated transition-[width] duration-200 lg:flex"
      [style.width.px]="collapsed() ? 76 : 256" aria-label="Primary">
      <div class="flex h-16 items-center gap-3 px-4">
        <img src="assets/logo-128.png" alt="" width="36" height="36" class="size-9 shrink-0 rounded-xl" />
        @if (!collapsed()) { <span class="text-lg font-semibold tracking-tight">SManager</span> <span class="rounded-md bg-accent-soft px-1.5 py-px text-[10px] leading-4 font-bold tracking-wide text-accent" title="AI-powered">AI</span> }
      </div>
      <nav class="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        @for (n of nav; track n.path) {
          <a class="nav-link" [routerLink]="n.path" [replaceUrl]="true" routerLinkActive="active" [attr.title]="collapsed() ? n.label : null" [attr.aria-label]="n.label">
            <tui-icon [icon]="n.icon" />
            @if (!collapsed()) { <span>{{ n.label }}</span> }
          </a>
        }
      </nav>
      <div class="flex flex-col gap-1 border-t border-line p-3">
        <button type="button" class="btn-ghost justify-start" (click)="toggleTheme()" [attr.aria-label]="'Switch to ' + (settings.theme() === 'dark' ? 'light' : 'dark') + ' mode'">
          <tui-icon [icon]="settings.theme() === 'dark' ? '@tui.sun' : '@tui.moon'" />
          @if (!collapsed()) { <span>{{ settings.theme() === 'dark' ? 'Light mode' : 'Dark mode' }}</span> }
        </button>
        <button type="button" class="btn-ghost justify-start" (click)="auth.logout()" aria-label="Sign out">
          <tui-icon icon="@tui.log-out" />@if (!collapsed()) { <span>Sign out</span> }
        </button>
        <button type="button" class="btn-ghost justify-start" (click)="toggleCollapse()" [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
          <tui-icon [icon]="collapsed() ? '@tui.panel-left' : '@tui.panel-left-close'" />@if (!collapsed()) { <span>Collapse</span> }
        </button>
      </div>
    </aside>

    <div class="min-h-dvh transition-[padding] duration-200" [style.padding-left.px]="isDesktop() ? (collapsed() ? 76 : 256) : 0">
      <!-- Top bar -->
      <header class="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur lg:px-8"
        style="padding-top: env(safe-area-inset-top); height: calc(4rem + env(safe-area-inset-top))">
        <img src="assets/logo-128.png" alt="" width="32" height="32" class="size-8 rounded-lg lg:hidden" />
        <span class="text-base font-semibold lg:hidden">SManager</span>
        <span class="lg:hidden rounded-md bg-accent-soft px-1.5 py-px text-[10px] leading-4 font-bold tracking-wide text-accent" title="AI-powered">AI</span>
        <span class="flex-1"></span>

        <div class="relative">
          <button type="button" class="btn-ghost relative !px-0" (click)="bellOpen.set(!bellOpen())" aria-label="Notifications" [attr.aria-expanded]="bellOpen()">
            <tui-icon icon="@tui.bell" />
            @if (ref.notificationCount() > 0) {
              <span class="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-expense px-1 text-[10px] leading-4 font-bold text-white">{{ ref.notificationCount() }}</span>
            }
          </button>
          @if (bellOpen()) {
            <div class="fixed inset-0 z-40" (click)="bellOpen.set(false)" aria-hidden="true"></div>
            <div class="card rise absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] p-2" role="dialog" aria-label="Notifications">
              @if (ref.notificationCount() === 0) {
                <p class="m-0 p-4 text-center text-sm text-muted">You’re all caught up.</p>
              }
              @for (p of ref.notifications().pending; track p.id) {
                <a class="flex items-center gap-3 rounded-xl p-3 text-fg no-underline hover:bg-surface-2" routerLink="/automations" (click)="bellOpen.set(false)">
                  <tui-icon icon="@tui.bell-ring" class="text-accent" />
                  <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ p.title }}</span>
                    <span class="text-xs text-muted">{{ p.status === 'FAILED' ? 'Failed – needs attention' : 'Confirm' }} · due {{ p.scheduledFor | smDate }}</span></span>
                  <span class="num text-sm">{{ p.amount | money }}</span>
                </a>
              }
              @for (u of ref.notifications().dueSoon; track u.automationId + u.date) {
                <a class="flex items-center gap-3 rounded-xl p-3 text-fg no-underline hover:bg-surface-2" routerLink="/automations" (click)="bellOpen.set(false)">
                  <tui-icon icon="@tui.calendar" class="text-warn" />
                  <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ u.title }}</span>
                    <span class="text-xs text-muted">Coming up · {{ u.date | smDate }}</span></span>
                  <span class="num text-sm">{{ u.amount | money }}</span>
                </a>
              }
            </div>
          }
        </div>

        <button type="button" class="btn-ghost !px-0 lg:hidden" (click)="toggleTheme()" aria-label="Toggle theme">
          <tui-icon [icon]="settings.theme() === 'dark' ? '@tui.sun' : '@tui.moon'" />
        </button>
        <button type="button" class="btn btn-primary hidden lg:inline-flex" (click)="quickAdd()"><tui-icon icon="@tui.plus" /> Add transaction</button>
      </header>

      @if (offline()) {
        <div class="flex items-center justify-center gap-2 bg-expense-soft px-4 py-2 text-sm text-expense" role="status">
          <tui-icon icon="@tui.wifi-off" /> You’re offline. Changes can’t be saved until you reconnect.
        </div>
      }

      <main id="main" class="mx-auto w-full max-w-[1280px] px-4 pt-5 pb-28 lg:px-8 lg:pb-10" tabindex="-1">
        <router-outlet />
      </main>
    </div>

    <!-- Mobile bottom navigation -->
    <nav class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-elevated/95 backdrop-blur lg:hidden" aria-label="Primary mobile"
      style="padding-bottom: env(safe-area-inset-bottom)">
      <div class="mx-auto grid max-w-lg grid-cols-5 items-center px-2">
        @for (n of bottom.left; track n.path) { <ng-container *ngTemplateOutlet="tab; context: { $implicit: n }" /> }
        <button type="button" class="btn-primary btn mx-auto -mt-6 grid size-14 place-items-center !rounded-full !p-0 shadow-xl" (click)="quickAdd()" aria-label="Add transaction">
          <tui-icon icon="@tui.plus" [style.font-size.px]="26" />
        </button>
        @for (n of bottom.right; track n.path) { <ng-container *ngTemplateOutlet="tab; context: { $implicit: n }" /> }
        <button type="button" class="flex min-h-14 flex-col items-center justify-center gap-0.5 border-0 bg-transparent text-[11px] text-muted" (click)="moreOpen.set(true)" aria-label="More sections">
          <tui-icon icon="@tui.menu" />More
        </button>
      </div>
    </nav>

    <ng-template #tab let-n>
      <a class="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted no-underline" [routerLink]="n.path" [replaceUrl]="true" routerLinkActive="!text-accent">
        <tui-icon [icon]="n.icon" />{{ n.label }}
      </a>
    </ng-template>

    @if (moreOpen()) {
      <div class="overlay" (click)="moreOpen.set(false)" aria-hidden="true"></div>
      <div class="sheet rise inset-x-0 bottom-0 rounded-t-3xl p-4" role="dialog" aria-label="More sections" style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))">
        <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong"></div>
        <div class="grid grid-cols-2 gap-2">
          @for (n of moreItems; track n.path) {
            <a class="nav-link border border-line bg-surface" [routerLink]="n.path" [replaceUrl]="true" (click)="moreOpen.set(false)"><tui-icon [icon]="n.icon" />{{ n.label }}</a>
          }
        </div>
        <button type="button" class="btn mt-3 w-full" (click)="moreOpen.set(false); auth.logout()"><tui-icon icon="@tui.log-out" /> Sign out</button>
      </div>
    }
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly ref = inject(RefData);
  protected readonly settings = inject(SettingsStore);
  private readonly dialogs = inject(Dialogs);
  private readonly router = inject(Router);

  protected readonly nav = NAV;
  protected readonly bottom = { left: NAV.slice(0, 2), right: [NAV[2]] };
  protected readonly moreItems = NAV.slice(3);
  protected readonly collapsed = signal(this.readCollapsed());
  protected readonly bellOpen = signal(false);
  protected readonly moreOpen = signal(false);
  protected readonly offline = signal(typeof navigator !== 'undefined' && !navigator.onLine);
  private readonly width = signal(typeof window !== 'undefined' ? window.innerWidth : 1280);
  protected readonly isDesktop = computed(() => this.width() >= 1024);

  constructor() {
    this.settings.load().subscribe({ error: () => undefined });
    this.ref.loadAll().subscribe({ error: () => undefined });
    // refresh the bell when navigating
    this.router.events.subscribe(() => { this.bellOpen.set(false); });
  }

  @HostListener('window:resize') onResize() { this.width.set(window.innerWidth); }
  @HostListener('window:online') onOnline() { this.offline.set(false); this.ref.loadAll().subscribe({ error: () => undefined }); }
  @HostListener('window:offline') onOffline() { this.offline.set(true); }
  @HostListener('document:keydown.escape') onEsc() { this.bellOpen.set(false); this.moreOpen.set(false); }

  protected quickAdd(): void {
    if (this.ref.activeAccounts().length === 0) {
      void this.dialogs.account();
      return;
    }
    void this.dialogs.transaction();
  }
  protected toggleTheme(): void { this.settings.toggleTheme(); }
  protected toggleCollapse(): void {
    const v = !this.collapsed();
    this.collapsed.set(v);
    try { localStorage.setItem(COLLAPSE_KEY, String(v)); } catch { /* ignore */ }
  }
  private readCollapsed(): boolean {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
  }
}
