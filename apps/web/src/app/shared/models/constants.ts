import { AccountType, Frequency } from './api.models';

export const COLOR_PALETTE = [
  '#22c55e', '#14b8a6', '#06b6d4', '#38bdf8', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#94a3b8',
];

/** Subset of the icons copied by scripts/copy-icons.mjs that make sense for categories/accounts. */
export const PICKABLE_ICONS = [
  'briefcase', 'laptop', 'store', 'percent', 'circle-plus', 'utensils', 'shopping-basket', 'house', 'receipt', 'car',
  'shopping-bag', 'heart-pulse', 'clapperboard', 'landmark', 'shield-check', 'trending-up', 'ellipsis', 'credit-card',
  'piggy-bank', 'banknote', 'building-2', 'star', 'gift', 'plane', 'coffee', 'music', 'gamepad-2', 'book-open',
  'graduation-cap', 'baby', 'dog', 'fuel', 'smartphone', 'wifi', 'zap', 'droplet', 'shirt', 'dumbbell', 'stethoscope',
  'pill', 'scissors', 'wrench', 'tv', 'globe', 'hand-coins', 'coins', 'bus', 'train', 'bike', 'pizza', 'beer', 'wine',
];

export const ACCOUNT_TYPES: Array<{ value: AccountType; label: string; icon: string }> = [
  { value: 'BANK', label: 'Bank account', icon: 'landmark' },
  { value: 'SAVINGS', label: 'Savings account', icon: 'piggy-bank' },
  { value: 'CASH', label: 'Cash', icon: 'banknote' },
  { value: 'CREDIT_CARD', label: 'Credit card', icon: 'credit-card' },
];
export const accountTypeLabel = (t: AccountType) => ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t;
export const accountTypeIcon = (t: AccountType) => ACCOUNT_TYPES.find((x) => x.value === t)?.icon ?? 'wallet';

export const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'BIMONTHLY', label: 'Every 2 months' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-yearly' },
  { value: 'YEARLY', label: 'Yearly' },
  { value: 'CUSTOM', label: 'Custom interval' },
];
export function frequencyLabel(f: Frequency, every?: number | null, unit?: string | null): string {
  if (f === 'CUSTOM' && every && unit) return `Every ${every} ${unit.toLowerCase()}${every > 1 ? 's' : ''}`;
  return FREQUENCIES.find((x) => x.value === f)?.label ?? f;
}

export const TIMEZONES = [
  'Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney',
];
export const LOCALES = [
  { value: 'en-IN', label: 'English (India) – 12,34,567' },
  { value: 'en-US', label: 'English (US) – 1,234,567' },
  { value: 'en-GB', label: 'English (UK) – 1,234,567' },
  { value: 'de-DE', label: 'German – 1.234.567' },
];
export const CURRENCIES = [
  { value: 'INR', label: 'Indian Rupee (₹)' }, { value: 'USD', label: 'US Dollar ($)' },
  { value: 'EUR', label: 'Euro (€)' }, { value: 'GBP', label: 'Pound (£)' }, { value: 'AED', label: 'UAE Dirham' },
];
