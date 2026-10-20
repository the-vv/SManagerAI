import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guards';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · SManager AI',
    loadComponent: () => import('./features/auth/auth.page').then((m) => m.AuthPage),
  },
  {
    path: 'e/:token',
    title: 'Shared event · SManager AI',
    loadComponent: () => import('./features/events/public-event.page').then((m) => m.PublicEventPage),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Dashboard · SManager AI', loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'transactions', title: 'Transactions · SManager AI', loadComponent: () => import('./features/transactions/transactions.page').then((m) => m.TransactionsPage) },
      { path: 'accounts', title: 'Accounts · SManager AI', loadComponent: () => import('./features/accounts/accounts.page').then((m) => m.AccountsPage) },
      { path: 'accounts/:id', title: 'Account · SManager AI', loadComponent: () => import('./features/accounts/account-detail.page').then((m) => m.AccountDetailPage) },
      { path: 'categories', title: 'Categories · SManager AI', loadComponent: () => import('./features/categories/categories.page').then((m) => m.CategoriesPage) },
      { path: 'events', title: 'Events · SManager AI', loadComponent: () => import('./features/events/events.page').then((m) => m.EventsPage) },
      { path: 'events/:id', title: 'Event · SManager AI', loadComponent: () => import('./features/events/event-detail.page').then((m) => m.EventDetailPage) },
      { path: 'automations', title: 'Automations · SManager AI', loadComponent: () => import('./features/automations/automations.page').then((m) => m.AutomationsPage) },
      { path: 'reports', title: 'Reports · SManager AI', loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage) },
      { path: 'settings', title: 'Settings · SManager AI', loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
