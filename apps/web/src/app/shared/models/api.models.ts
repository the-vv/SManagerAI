/** Wire types of the REST API. All money values are integer minor units (paise). */

export type AccountType = 'BANK' | 'SAVINGS' | 'CASH' | 'CREDIT_CARD';
export type CategoryType = 'INCOME' | 'EXPENSE';
export type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER_OUT' | 'TRANSFER_IN';
export type TransactionSource = 'MANUAL' | 'AUTOMATION_AUTO' | 'AUTOMATION_CONFIRMED';
export type Frequency =
  | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM';
export type IntervalUnit = 'DAY' | 'WEEK' | 'MONTH';
export type AutomationMode = 'AUTO' | 'REMINDER';
export type ExecutionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface User { id: string; email: string; name: string; }

export interface AuthConfig { registrationOpen: boolean; googleClientId: string | null; }

export interface AuthResult { user: User; expiresAt: string; token?: string; }

export interface SessionInfo {
  id: string; userAgent: string | null; createdAt: string; lastUsedAt: string; expiresAt: string; current: boolean;
}

export interface Account {
  id: string; name: string; institution: string | null; identifier: string | null; type: AccountType;
  openingBalance: number; openingDate: string; isDefault: boolean; isActive: boolean;
  color: string | null; icon: string | null; balance: number;
}

export interface AccountsOverview {
  items: Account[];
  asOf: string | null;
  totals: { available: number; creditDue: number; netWorth: number };
}

export interface Adjustment { id: string; accountId: string; amount: number; effectiveAt: string; reason: string; createdAt: string; }

export interface Category {
  id: string; name: string; type: CategoryType; color: string | null; icon: string | null; isActive: boolean;
}

export interface Transaction {
  id: string; kind: TransactionKind; amount: number; title: string; notes: string | null;
  occurredAt: string; source: TransactionSource; automationId: string | null; aiGenerated: boolean;
  account: { id: string; name: string; color: string | null };
  category: { id: string; name: string; color: string | null; icon: string | null } | null;
  transfer: { id: string; fromAccountId: string; toAccountId: string; fromAccountName: string; toAccountName: string } | null;
  createdAt: string; updatedAt: string;
}

export interface TxSummary { income: number; expense: number; net: number; count: number; }

export interface TransactionPage {
  items: Transaction[]; total: number; page: number; pageSize: number;
  summary: TxSummary; dailyTotals: Record<string, { income: number; expense: number }>;
}

export interface CategoryRow {
  categoryId: string | null; name: string; color: string | null; icon: string | null;
  total: number; count: number; shareBp: number;
}
export interface CategoryBreakdown { total: number; items: CategoryRow[]; }

export interface Reconciliation {
  opening: number; income: number; expense: number; transfersNet: number; adjustments: number;
  closing: number; netMovement: number;
}

export interface UpcomingItem {
  automationId: string; title: string; kind: CategoryType; amount: number; date: string; mode: AutomationMode;
  accountId: string; accountName: string; categoryName: string | null; categoryColor: string | null; dueSoon: boolean;
}

export interface MonthPoint { month: string; income: number; expense: number; net: number; }

export interface Dashboard {
  month: string; accountId: string | null; timezone: string;
  summary: {
    income: number; expense: number; net: number;
    previous: { income: number; expense: number; net: number };
    delta: { income: number; expense: number; net: number };
  };
  period: Reconciliation;
  currentBalance: { accountId: string; name: string; type: AccountType; balance: number } | null;
  combined: { available: number; creditDue: number; netWorth: number };
  accounts: Array<{ id: string; name: string; type: AccountType; color: string | null; balance: number }>;
  expenseByCategory: CategoryBreakdown;
  incomeByCategory: CategoryBreakdown;
  trend: MonthPoint[];
  recentTransactions: Transaction[];
  upcoming: UpcomingItem[];
  pendingReminders: number;
}

export interface Automation {
  id: string; title: string; kind: CategoryType; amount: number; description: string | null;
  accountId: string; accountName: string | null; categoryId: string | null; categoryName: string | null;
  categoryColor: string | null; frequency: Frequency; customEvery: number | null; customUnit: IntervalUnit | null;
  dayOfMonth: number | null; startDate: string; endDate: string | null; nextRunDate: string | null;
  mode: AutomationMode; reminderDaysBefore: number; isEnabled: boolean; lastRunAt: string | null;
  monthlyEquivalent: number; finished: boolean;
}

export interface Execution {
  id: string; automationId: string; title: string; kind: CategoryType; scheduledFor: string;
  status: ExecutionStatus; amount: number; transactionId: string | null; error: string | null;
  executedAt: string | null; createdAt: string;
}

export interface Notifications { pending: Execution[]; dueSoon: UpcomingItem[]; }

export interface Settings {
  currency: string; locale: string; timezone: string; theme: 'dark' | 'light'; dateFormat: string;
  timeFormat: '12h' | '24h'; useCategoryColors: boolean; defaultTxKind: 'INCOME' | 'EXPENSE';
  defaultAutomationMode: AutomationMode; reminderDaysBefore: number;
}

export interface RecurringItem {
  id: string; title: string; kind: CategoryType; amount: number; frequency: Frequency; mode: AutomationMode;
  nextRunDate: string | null; accountName: string; categoryName: string | null; monthlyEquivalent: number;
}

export interface Report {
  from: string; to: string; accountId: string | null; timezone: string;
  summary: Reconciliation;
  monthly: Array<MonthPoint & { closingBalance: number }>;
  expenseByCategory: CategoryBreakdown;
  incomeByCategory: CategoryBreakdown;
  accounts: Array<{
    id: string; name: string; type: AccountType; isActive: boolean; color: string | null;
    income: number; expense: number; net: number; openingBalance: number; closingBalance: number;
  }>;
  largestExpenses: Array<{
    id: string; title: string; amount: number; date: string; accountName: string;
    categoryName: string | null; categoryColor: string | null;
  }>;
  monthOverMonth: {
    month: string; previousMonth: string; totalCurrent: number; totalPrevious: number; totalDelta: number;
    categories: Array<{ name: string; color: string | null; current: number; previous: number; delta: number }>;
  };
  recurring: { items: RecurringItem[]; monthlyExpenses: number; monthlyIncome: number };
}

export interface ApiErrorBody {
  statusCode: number; error: string; message: string; details?: string[]; path: string; timestamp: string;
}
