
export type Role = 'admin' | 'member' | 'owner';

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
  personalSpaceId?: string | null;
  currentSpaceId?: string | null;
  currentSpaceType?: 'personal' | 'group';
  currentSpaceName?: string | null;
  currentSpaceRole?: 'owner' | 'admin' | 'member' | null;
  spaceMemberships?: { [key: string]: 'owner' | 'admin' | 'member' };
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

// ── Edit history entry (stored per edit under editHistory/{timestamp}) ──
export interface IEditHistoryEntry {
  editedAt: string;
  editedBy: string;
  editedByName: string;
  editedByPhotoURL?: string | null;
  device?: string;
  changes: {
    [field: string]: { from: any; to: any };
  };
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
  userId?: string;         // createdById
  createdByName?: string;  // Creator's name at creation time
  createdByPhotoURL?: string | null;
  groupId?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;      // UID of last editor
  updatedByPhotoURL?: string | null;
  device?: string;
  editedDevice?: string;
  // ── Edit history: key = timestamp (Date.now()), value = IEditHistoryEntry ──
  editHistory?: { [key: string]: IEditHistoryEntry };
}
