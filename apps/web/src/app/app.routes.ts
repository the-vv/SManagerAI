import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guards';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · SManager',
    loadComponent: () => import('./features/auth/auth.page').then((m) => m.AuthPage),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Dashboard · SManager', loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'transactions', title: 'Transactions · SManager', loadComponent: () => import('./features/transactions/transactions.page').then((m) => m.TransactionsPage) },
      { path: 'accounts', title: 'Accounts · SManager', loadComponent: () => import('./features/accounts/accounts.page').then((m) => m.AccountsPage) },
      { path: 'accounts/:id', title: 'Account · SManager', loadComponent: () => import('./features/accounts/account-detail.page').then((m) => m.AccountDetailPage) },
      { path: 'categories', title: 'Categories · SManager', loadComponent: () => import('./features/categories/categories.page').then((m) => m.CategoriesPage) },
      { path: 'automations', title: 'Automations · SManager', loadComponent: () => import('./features/automations/automations.page').then((m) => m.AutomationsPage) },
      { path: 'reports', title: 'Reports · SManager', loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage) },
      { path: 'settings', title: 'Settings · SManager', loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
