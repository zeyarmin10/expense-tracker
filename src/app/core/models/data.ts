
export type Role = 'admin' | 'member';

export interface IGroupMember {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: Role;
}

export interface IUserProfile {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  currency: string;
  defaultBudgetPeriod?: 'monthly' | 'quarterly' | 'yearly' | 'custom';
  groupId?: string | null;
  roles?: { [key: string]: Role };
  createdAt?: any;
}

export interface IInvitation {
  key?: string;
  email: string;
  groupId: string;
  status: 'pending' | 'accepted';
  createdAt: any;
  invitedBy: string;
}

export interface DataICategory {
  id?: string;
  name: string;
  userId?: string;
  groupId?: string;
  createdAt?: string;
}

export interface DataIExpense {
  id?: string;
  date: string;
  category: string;
  categoryId?: string;
  itemName: string;
  quantity: number;
  unit?: string;
  price: number; 
  totalCost?: number;
  currency: string;
  description?: string;
  // Tracking
  userId?: string; // This is createdById
  createdByName?: string; // Creator's name at the time of creation
  groupId?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string; // UID of user who last updated
  device?: string;
  editedDevice?: string;
}
