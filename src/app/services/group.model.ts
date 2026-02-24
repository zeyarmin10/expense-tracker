import { Role } from './user-data';

export interface Group {
  id?: string;
  groupName: string;
  currency: string;
  members?: { [key: string]: Role };
  // Budget settings
  budgetPeriod?: 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'weekly' | null;
  budgetStartDate?: string;
  budgetEndDate?: string;
  selectedBudgetPeriodId?: string | null;
  // Tracking
  ownerId: string;
  createdAt?: any;
}
