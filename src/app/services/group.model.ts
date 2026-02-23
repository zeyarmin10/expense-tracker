export interface Group {
  groupName: string;
  ownerId: string;
  currency?: string;
  budgetPeriod?: string | null;
  selectedBudgetPeriodId?: string | null;
}
