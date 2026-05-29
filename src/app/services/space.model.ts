export type SpaceType = 'personal' | 'group';
export type SpaceRole = 'owner' | 'admin' | 'member';

export interface Space {
  id?: string;
  type: SpaceType;
  name: string;
  ownerId: string;
  currency: string;
  budgetPeriod?: 'weekly' | 'monthly' | 'yearly' | 'custom' | null;
  budgetStartDate?: string | null;
  budgetEndDate?: string | null;
  selectedBudgetPeriodId?: string | null;
  imageUrl?: string | null;
  avatarUrl?: string | null;
  logoUrl?: string | null;
  photoURL?: string | null;
  createdAt?: number | string;
}

export interface UserSpaceSummary extends Space {
  role: SpaceRole;
}
