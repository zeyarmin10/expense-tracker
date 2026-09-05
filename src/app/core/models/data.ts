
export interface IUserProfile {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  currency: string;
  defaultBudgetPeriod?: 'monthly' | 'quarterly' | 'yearly' | 'custom';
  groupId?: string | null;
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

// A POS-cart purchase (2+ products bought in one visit) writes `lineItems`
// on the parent DataIExpense and leaves productId/quantity/price/itemName
// unset — mirrors IncomeLineItem/ServiceIIncome.lineItems on the sales side.
export interface ExpenseLineItem {
  productId: string;
  productName: string;
  unit?: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface DataIExpense {
  id?: string;
  date: string;
  category: string;
  categoryId?: string;
  productId?: string;
  itemName: string;
  // Unset (with lineItems populated instead) for a multi-item POS-style
  // purchase — a single quantity/price pair only ever describes ONE line.
  quantity?: number;
  unit?: string;
  price?: number;
  totalCost?: number;
  currency: string;
  description?: string;
  lineItems?: ExpenseLineItem[];
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
  // ── Soft delete — absent/'active' means normal; 'void' means cancelled.
  // Never remove()'d so stock/reports stay auditable — see ExpenseService's
  // getExpenses()/voidExpense() and InventoryService.getStockSummary(). ──
  status?: 'active' | 'void';
  voidedAt?: string;
  voidedBy?: string;
  voidedByName?: string;
  voidReason?: string;
}

export interface DataIVoucher {
  id?: string;
  date: string;
  title?: string;
  category?: string;
  note?: string;
  imageUrl: string;
  imageUrls?: string[];
  imageCount?: number;
  storagePath: string;
  storagePaths?: string[];
  fileName: string;
  contentType?: string;
  size?: number;
  userId?: string;
  createdByName?: string;
  createdByPhotoURL?: string | null;
  groupId?: string;
  createdAt?: string;
  device?: string;
}
