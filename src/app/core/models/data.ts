
export interface IGroupMember {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: 'admin' | 'editor' | 'viewer';
}

export interface IUserProfile {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  currency: string;
  defaultBudgetPeriod?: 'monthly' | 'quarterly' | 'yearly' | 'custom';
  groupId?: string | null;
  roles?: { [key: string]: 'admin' | 'editor' | 'viewer' };
  createdAt?: any;
}

export interface DataICategory {
  id: string;
  name: string;
  [key: string]: any;
}

export interface DataIExpense {
  id: string;
  date: string;
  category: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  currency: string;
  [key: string]: any;
}
