import { CategoryType } from '../generated/prisma/enums.js';

/** Seeded once per new user into the DB. They are ordinary rows - fully editable afterwards. */
export interface DefaultCategory {
  name: string;
  type: CategoryType;
  color: string;
  icon: string; // Lucide icon name
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Salary', type: 'INCOME', color: '#22c55e', icon: 'briefcase' },
  { name: 'Freelance', type: 'INCOME', color: '#14b8a6', icon: 'laptop' },
  { name: 'Business', type: 'INCOME', color: '#06b6d4', icon: 'store' },
  { name: 'Interest', type: 'INCOME', color: '#84cc16', icon: 'percent' },
  { name: 'Other income', type: 'INCOME', color: '#a3e635', icon: 'circle-plus' },
  { name: 'Food', type: 'EXPENSE', color: '#f97316', icon: 'utensils' },
  { name: 'Groceries', type: 'EXPENSE', color: '#eab308', icon: 'shopping-basket' },
  { name: 'Rent', type: 'EXPENSE', color: '#ef4444', icon: 'house' },
  { name: 'Bills', type: 'EXPENSE', color: '#f43f5e', icon: 'receipt' },
  { name: 'Transport', type: 'EXPENSE', color: '#3b82f6', icon: 'car' },
  { name: 'Shopping', type: 'EXPENSE', color: '#ec4899', icon: 'shopping-bag' },
  { name: 'Healthcare', type: 'EXPENSE', color: '#10b981', icon: 'heart-pulse' },
  { name: 'Entertainment', type: 'EXPENSE', color: '#a855f7', icon: 'clapperboard' },
  { name: 'EMI', type: 'EXPENSE', color: '#f59e0b', icon: 'landmark' },
  { name: 'Insurance', type: 'EXPENSE', color: '#6366f1', icon: 'shield-check' },
  { name: 'Investment', type: 'EXPENSE', color: '#8b5cf6', icon: 'trending-up' },
  { name: 'Other expenses', type: 'EXPENSE', color: '#94a3b8', icon: 'ellipsis' },
];
