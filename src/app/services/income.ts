import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Observable, of, firstValueFrom, from, combineLatest } from 'rxjs';
import { map, switchMap, catchError, filter } from 'rxjs/operators';
import {
  Database,
  ref,
  push,
  remove,
  update,
  DatabaseReference,
  query,
  orderByChild,
  get,
  objectVal,
  runTransaction,
  onValue,
} from '@angular/fire/database';
import { AuthService } from './auth';
import { getActiveGroupId, UserDataService, UserProfile, PublicUserProfile } from './user-data';
import { SpaceDataService } from './space-data.service';
import { SpaceSwitchLoadingService } from './space-switch-loading.service';
import { toLocalDateKey } from './date-filter.service';
import { PersonalOfflineDataService } from './personal-offline-data.service';
import { SharedOfflineDataService } from './shared-offline-data.service';
import { NetworkService } from './network.service';
import { getExpenseLineItems, ServiceIExpense } from './expense';
import type { OfflineOperation } from './offline-store.service';

export interface IncomeLineItem {
  productId: string;
  productName: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ServiceIIncome {
  id?: string;
  date: string;
  amount: number;
  currency: string;
  description?: string;
  /** Stable, human-searchable numeric code printed on a sale receipt. */
  receiptCode?: string;
  isProductSale?: boolean;
  // Legacy single-item shape — still written/read for a plain "this sale is
  // one product" entry. A POS cart checkout (2+ items) writes `lineItems`
  // instead and leaves these three unset; see getIncomeLineItems() below.
  productId?: string;
  quantity?: number;
  unitPrice?: number;
  lineItems?: IncomeLineItem[];
  userId?: string;
  groupId?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Makes an offline replay safe when the server committed before acknowledgement. */
  lastOfflineOperationId?: string;
  createdByName?: string;
  createdByPhotoURL?: string | null;
  device: string;
  editedDevice?: string;
  // ── Soft delete — absent/'active' means normal; 'void' means cancelled.
  // Never remove()'d so stock/reports stay auditable — see IncomeService's
  // getIncomes()/voidIncome() and InventoryService.getStockSummary(). ──
  status?: 'active' | 'void';
  voidedAt?: string;
  voidedBy?: string;
  voidedByName?: string;
  voidReason?: string;
}

// Every product-sale consumer (stock/profit math, the shop dashboard's
// rankings, the Recorded Sales list) should read through this instead of
// `income.productId`/`quantity` directly — it's the one place that knows
// about both the legacy single-item shape and the newer POS `lineItems`
// array, so a sale's line items never need to be re-derived ad hoc.
export function getIncomeLineItems(income: ServiceIIncome): IncomeLineItem[] {
  if (income.lineItems && income.lineItems.length > 0) {
    return income.lineItems;
  }
  if (income.isProductSale && income.productId) {
    const quantity = Number(income.quantity) || 0;
    const unitPrice = Number(income.unitPrice) || 0;
    // amount is the one field a single-item sale has always reliably had —
    // prefer it over quantity*unitPrice, which older records may not have
    // consistently stored (matches the pre-lineItems revenue calculation).
    const subtotal = Number(income.amount) || quantity * unitPrice;
    return [{
      productId: income.productId,
      productName: '',
      quantity,
      unitPrice,
      subtotal,
    }];
  }
  return [];
}

/** Uses the same legacy/cart line-item rules as the inventory summary. */
export function hasStockForProductSale(
  expenses: Record<string, ServiceIExpense>,
  incomes: Record<string, ServiceIIncome>,
  candidate: ServiceIIncome,
  excludedIncomeId?: string,
): boolean {
  const balance = new Map<string, number>();
  for (const expense of Object.values(expenses)) {
    if (expense.status === 'void' || expense.currency !== candidate.currency) continue;
    for (const item of getExpenseLineItems(expense)) {
      if (item.productId) balance.set(item.productId, (balance.get(item.productId) || 0) + Number(item.quantity || 0));
    }
  }
  for (const [id, income] of Object.entries(incomes)) {
    if (id === excludedIncomeId || income.status === 'void' || !income.isProductSale || income.currency !== candidate.currency) continue;
    for (const item of getIncomeLineItems(income)) {
      if (item.productId) balance.set(item.productId, (balance.get(item.productId) || 0) - Number(item.quantity || 0));
    }
  }
  const requestedByProduct = new Map<string, number>();
  for (const item of getIncomeLineItems(candidate)) {
    requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) || 0) + Number(item.quantity));
  }
  return [...requestedByProduct].every(([productId, quantity]) => quantity <= (balance.get(productId) || 0));
}

@Injectable({
  providedIn: 'root',
})
export class IncomeService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private spaceDataService = inject(SpaceDataService);
  private spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);
  private personalOfflineData = inject(PersonalOfflineDataService);
  private sharedOfflineData = inject(SharedOfflineDataService);
  private network = inject(NetworkService);

  constructor() {
  }

  private getIncomesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/incomes`);
  }

  private getGroupIncomesRef(groupId: string): DatabaseReference {
    return ref(this.db, `group_data/${groupId}/incomes`);
  }

  private async refreshConnectionStateForWrite(): Promise<void> {
    if (this.network.isOnline$.value) {
      await this.network.refreshInternetAccess();
    }
  }

  /**
   * Product sales use one transaction at the common parent of purchases and
   * sales. Stock is derived from those two collections, so checking a client
   * observable and then pushing an income cannot protect two simultaneous
   * checkouts. Offline sales enter a queue and pass this same transaction
   * when the connection returns; local stock checks are provisional.
   */
  private async getStockTransactionRoot(profile: UserProfile): Promise<DatabaseReference> {
    const [expenses, incomes] = await Promise.all([
      this.spaceDataService.getActiveCollectionContext(profile, 'expenses'),
      this.spaceDataService.getActiveCollectionContext(profile, 'incomes'),
    ]);
    if (expenses.source !== incomes.source) {
      throw new Error('STOCK_CHECK_RETRY');
    }
    if (incomes.source === 'canonical' && incomes.spaceId) {
      return ref(this.db, `space_data/${incomes.spaceId}`);
    }
    const groupId = getActiveGroupId(profile);
    return ref(this.db, groupId ? `group_data/${groupId}` : `users/${profile.uid}`);
  }

  private async saveProductSaleTransaction(
    rootRef: DatabaseReference,
    incomeId: string,
    incoming: Partial<ServiceIIncome>,
    mode: 'add' | 'update',
    baseUpdatedAt?: string | null,
    offlineOperationId?: string,
  ): Promise<void> {
    if (!this.network.isOnline$.value) {
      throw new Error('STOCK_CHECK_ONLINE_REQUIRED');
    }
    // get() alone does not keep the RTDB sync tree populated for the first
    // transaction callback. Keep a value listener active until commit so that
    // the callback starts with the current purchases instead of null.
    let resolveReady!: () => void;
    let rejectReady!: (reason: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const stopListening = onValue(rootRef, (snapshot) => {
      if (snapshot.exists()) resolveReady();
      else rejectReady(new Error('STOCK_CHECK_RETRY'));
    }, rejectReady);
    let abortReason = 'STOCK_CHECK_RETRY';
    try {
      await ready;
      const result = await runTransaction(rootRef, (currentData: any) => {
        abortReason = 'STOCK_CHECK_RETRY';
        if (!currentData) return;

        const incomes = (currentData.incomes || {}) as Record<string, ServiceIIncome>;
        const expenses = (currentData.expenses || {}) as Record<string, ServiceIExpense>;
        const existingIncome = incomes[incomeId];
        // A server commit can succeed just before the device loses its
        // connection, leaving the local queue entry in place. Its retry is a
        // success, rather than a second sale or an edit conflict.
        if (offlineOperationId && existingIncome?.lastOfflineOperationId === offlineOperationId) {
          return currentData;
        }
        const oldIncome = mode === 'update' ? existingIncome : undefined;
        if (mode === 'update' && (!oldIncome || oldIncome.status === 'void')) return;
        if (mode === 'add' && existingIncome) return;
        if (oldIncome && baseUpdatedAt &&
          (oldIncome.updatedAt || oldIncome.createdAt) !== baseUpdatedAt) {
          abortReason = 'SYNC_CONFLICT: This shared sale changed on another device.';
          return;
        }

        const nextIncome = mode === 'update'
          ? { ...oldIncome, ...incoming } as ServiceIIncome
          : incoming as ServiceIIncome;
        if (offlineOperationId) nextIncome.lastOfflineOperationId = offlineOperationId;
        const requested = nextIncome.isProductSale ? getIncomeLineItems(nextIncome) : [];
        if (nextIncome.isProductSale && nextIncome.status !== 'void' && (
          requested.length === 0 ||
          requested.some((item) => !item.productId || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)
        )) {
          abortReason = 'STOCK_INVALID_SALE';
          return;
        }

        if (nextIncome.isProductSale && nextIncome.status !== 'void' &&
          !hasStockForProductSale(expenses, incomes, nextIncome, incomeId)) {
          abortReason = 'STOCK_INSUFFICIENT';
          return;
        }

        return {
          ...currentData,
          incomes: { ...incomes, [incomeId]: nextIncome },
        };
      }, { applyLocally: false });
      if (!result.committed) throw new Error(abortReason);
    } finally {
      stopListening();
    }
  }

  private async assertOfflineProductSaleStock(
    profile: UserProfile,
    candidate: ServiceIIncome,
    excludedIncomeId?: string,
  ): Promise<void> {
    if (!candidate.isProductSale || candidate.status === 'void') return;
    const shared = this.sharedOfflineData.isOfflineShared(profile);
    const [expenses, incomes] = await Promise.all([
      shared
        ? this.sharedOfflineData.read<ServiceIExpense>(profile, 'expenses')
        : this.personalOfflineData.read<ServiceIExpense>(profile, 'expenses'),
      shared
        ? this.sharedOfflineData.read<ServiceIIncome>(profile, 'incomes')
        : this.personalOfflineData.read<ServiceIIncome>(profile, 'incomes'),
    ]);
    const requested = getIncomeLineItems(candidate);
    if (requested.length === 0 || requested.some((item) =>
      !item.productId || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      throw new Error('STOCK_INVALID_SALE');
    }
    if (!hasStockForProductSale(expenses, incomes, candidate, excludedIncomeId)) {
      throw new Error('STOCK_INSUFFICIENT');
    }
  }

  /** Replays an offline product sale against current server stock. */
  async applyQueuedProductSale(operation: OfflineOperation): Promise<void> {
    const parts = operation.path.split('/');
    const incomeId = parts.at(-1);
    if (parts.at(-2) !== 'incomes' || !incomeId || parts.length < 4 || !operation.payload) {
      throw new Error('Invalid queued product sale.');
    }
    const rootRef = ref(this.db, parts.slice(0, -2).join('/'));
    const mode = operation.kind === 'stockSaleSet' ? 'add' : 'update';
    try {
      await this.saveProductSaleTransaction(rootRef, incomeId, operation.payload, mode, operation.baseUpdatedAt, operation.id);
    } catch (error: any) {
      if (error?.message === 'STOCK_INSUFFICIENT') {
        throw new Error('SYNC_CONFLICT:STOCK_INSUFFICIENT');
      }
      throw error;
    }
  }

  async addIncome(
    incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'groupId' | 'createdAt' | 'device' | 'editedDevice'>
  ): Promise<'saved' | 'queued'> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
        throw new Error('User not authenticated.');
    }
    await this.refreshConnectionStateForWrite();

    const newIncomeToSave: Omit<ServiceIIncome, 'id'> = {
      ...incomeData,
      userId: profile.uid,
      ...(getActiveGroupId(profile) ? { groupId: getActiveGroupId(profile)! } : {}),
      createdByName: profile.displayName || 'Anonymous',
      createdByPhotoURL: profile.photoURL || null,
      createdAt: new Date().toISOString(),
      device: navigator.userAgent,
    };

    if (this.sharedOfflineData.isOfflineShared(profile)) {
      if (incomeData.isProductSale) await this.assertOfflineProductSaleStock(profile, newIncomeToSave as ServiceIIncome);
      await this.sharedOfflineData.write(
        profile, 'incomes', incomeData.isProductSale ? 'stockSaleSet' : 'set', this.sharedOfflineData.createRecordId('incomes'),
        { ...newIncomeToSave, groupId: getActiveGroupId(profile) },
      );
      return 'queued';
    }

    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      if (incomeData.isProductSale) await this.assertOfflineProductSaleStock(profile, newIncomeToSave as ServiceIIncome);
      await this.personalOfflineData.write(
        profile, 'incomes', incomeData.isProductSale ? 'stockSaleSet' : 'set', this.personalOfflineData.createRecordId('incomes'), newIncomeToSave,
      );
      return 'queued';
    }

    if (incomeData.isProductSale && !this.network.isOnline$.value) {
      throw new Error('STOCK_CHECK_ONLINE_REQUIRED');
    }

    if (incomeData.isProductSale) {
      const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'incomes');
      const incomeId = push(canonicalRef || legacyRef).key;
      if (!incomeId) throw new Error('STOCK_CHECK_RETRY');
      await this.saveProductSaleTransaction(await this.getStockTransactionRoot(profile), incomeId, newIncomeToSave, 'add');
      return 'saved';
    }

    let incomesRef: DatabaseReference;
    const activeGroupId = getActiveGroupId(profile);
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'incomes');
    if (activeGroupId) {
        newIncomeToSave.groupId = activeGroupId;
        incomesRef = canonicalRef || legacyRef;
    } else {
        incomesRef = canonicalRef || legacyRef;
    }

    await push(incomesRef, newIncomeToSave);
    return 'saved';
  }

  getIncomes(
    startDate?: Date,
    endDate?: Date,
    profileOverride?: UserProfile,
  ): Observable<ServiceIIncome[]> {
    const profile$ = profileOverride
      ? of(profileOverride)
      : this.authService.userProfile$.pipe(
          filter((profile): profile is UserProfile => profile !== null),
        );

    return combineLatest([profile$, this.network.isOnline$]).pipe(
      switchMap(([profile]) => {
        if (this.sharedOfflineData.isOfflineShared(profile)) {
          return from(this.sharedOfflineData.read<ServiceIIncome>(profile, 'incomes')).pipe(
            map(incomes => {
              const start = startDate ? toLocalDateKey(startDate) : null;
              const end = endDate ? toLocalDateKey(endDate) : null;
              return Object.entries(incomes)
                .map(([id, income]) => ({ id, ...income }))
                .filter(income => income.status !== 'void' &&
                  (!start || !end || (income.date >= start && income.date <= end)));
            }),
          );
        }
        if (this.personalOfflineData.isOfflinePersonal(profile)) {
          return from(this.personalOfflineData.read<ServiceIIncome>(profile, 'incomes')).pipe(
            map(incomesData => {
              const start = startDate ? toLocalDateKey(startDate) : null;
              const end = endDate ? toLocalDateKey(endDate) : null;
              return Object.entries(incomesData)
                .map(([id, income]) => ({ id, ...income }))
                .filter(income => income.status !== 'void' &&
                  (!start || !end || (income.date >= start && income.date <= end)));
            }),
          );
        }
        return this.spaceSwitchLoadingService.track(
          from(this.spaceDataService.getActiveCollectionContext(profile, 'incomes')),
        ).pipe(
          switchMap(({ canonicalRef, legacyRef }) => {
            const baseRef = canonicalRef || legacyRef;
            // Read every change from the server and cache the full collection.
            return this.spaceSwitchLoadingService.track(objectVal<Record<string, Record<string, unknown>> | null>(baseRef)).pipe(
          switchMap(async incomesData => {
            const offlineData = getActiveGroupId(profile) ? this.sharedOfflineData : this.personalOfflineData;
            const serverRecords = incomesData || {};
            await offlineData.cacheRemote(profile, 'incomes', serverRecords);
            // Native keeps unsynced local sales visible while the connection
            // returns and the stock-checked sync is still in progress.
            const records = Capacitor.isNativePlatform()
              ? await offlineData.read<ServiceIIncome>(profile, 'incomes')
              : serverRecords;

            const userIds = new Set<string>();
            Object.values(records).forEach((income: any) => {
              if (income.userId) {
                userIds.add(income.userId);
              }
            });

            // Reads the public display-identity mirror (name + photo only) —
            // all a "created by" join needs, and unlike the full profile it's
            // readable regardless of shared-space state on either side.
            const userProfiles: Record<string, PublicUserProfile> = {};
            if (userIds.size > 0) {
              const results = await Promise.all(
                [...userIds].map(uid =>
                  firstValueFrom(this.userDataService.getPublicProfile(uid))
                    .then(p => ({ uid, profile: p }))
                    // A denied/failed profile lookup (e.g. permission gap for
                    // a former member) must not take down the whole income list.
                    .catch(() => ({ uid, profile: null }))
                )
              );
              results.forEach(({ uid, profile }) => {
                if (profile) userProfiles[uid] = profile;
              });
            }

            return Object.keys(records).map(key => {
              const income = records[key] as unknown as ServiceIIncome;
              // Prefer the live profile over the snapshot stored at creation
              // time, so a member's name/photo update reaches past records —
              // fall back to the snapshot only if the live lookup found nothing.
              const creatorProfile = income.userId ? userProfiles[income.userId] : undefined;
              const createdByName = creatorProfile
                ? (creatorProfile.displayName || 'Former Member')
                : (income.createdByName || 'Former Member');
              const createdByPhotoURL = creatorProfile
                ? (creatorProfile.photoURL || null)
                : (income.createdByPhotoURL ?? null);
              return {
                id: key,
                ...income,
                createdByName,
                createdByPhotoURL,
              } as ServiceIIncome;
            })
              // Voided (soft-deleted) records stay in Firebase forever for
              // audit purposes but never surface here — every caller (lists,
              // InventoryService's stock derivation, ProfitLossService's
              // totals, SalesReport) reads through this one method, so
              // filtering once here is enough to fix all of them at once.
              .filter((i: ServiceIIncome) => {
                const start = startDate ? toLocalDateKey(startDate) : null;
                const end = endDate ? toLocalDateKey(endDate) : null;
                return i.status !== 'void' &&
                  (!start || !end || (i.date >= start && i.date <= end));
              });
          }),
          catchError(error => {
            console.error('Error fetching incomes:', error);
            return of([]);
          })
            );
          }),
        );
      })
    );
  }

  async updateIncome(
    incomeId: string,
    updatedData: Partial<Omit<ServiceIIncome, 'id' | 'userId' | 'groupId' | 'createdAt'>>
  ): Promise<'saved' | 'queued'> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
        throw new Error('User not authenticated.');
    }

    if (!incomeId) {
      throw new Error('Income ID is required for update.');
    }
    await this.refreshConnectionStateForWrite();

    if (this.sharedOfflineData.isOfflineShared(profile)) {
      const records = await this.sharedOfflineData.read<ServiceIIncome>(profile, 'incomes');
      const current = records[incomeId];
      if (!current) throw new Error('Income not found on this device.');
      const isProductSaleEdit = current.isProductSale || updatedData.isProductSale;
      if (isProductSaleEdit) {
        await this.assertOfflineProductSaleStock(profile, { ...current, ...updatedData } as ServiceIIncome, incomeId);
      }
      await this.sharedOfflineData.write(profile, 'incomes', isProductSaleEdit ? 'stockSaleUpdate' : 'update', incomeId, {
        ...updatedData, editedDevice: navigator.userAgent, updatedAt: new Date().toISOString(),
      }, current.updatedAt || current.createdAt || null);
      return 'queued';
    }

    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      const records = await this.personalOfflineData.read<ServiceIIncome>(profile, 'incomes');
      const current = records[incomeId];
      const isProductSaleEdit = current?.isProductSale || updatedData.isProductSale;
      if (isProductSaleEdit) {
        await this.assertOfflineProductSaleStock(profile, { ...current, ...updatedData } as ServiceIIncome, incomeId);
      }
      await this.personalOfflineData.write(profile, 'incomes', isProductSaleEdit ? 'stockSaleUpdate' : 'update', incomeId, {
        ...updatedData,
        editedDevice: navigator.userAgent,
      });
      return 'queued';
    }

    let incomeRef: DatabaseReference;
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'incomes');
    if (canonicalRef && currentSpaceId) {
        incomeRef = ref(this.db, `space_data/${currentSpaceId}/incomes/${incomeId}`);
    } else if (activeGroupId) {
        incomeRef = ref(this.db, `group_data/${activeGroupId}/incomes/${incomeId}`);
    } else {
        incomeRef = ref(this.db, `users/${profile.uid}/incomes/${incomeId}`);
    }

    const currentSnapshot = await get(incomeRef);
    const current = currentSnapshot.val() as ServiceIIncome | null;
    const patch = { ...updatedData, editedDevice: navigator.userAgent };
    if (current?.isProductSale || updatedData.isProductSale) {
      await this.saveProductSaleTransaction(await this.getStockTransactionRoot(profile), incomeId, patch, 'update');
      return 'saved';
    }
    await update(incomeRef, patch);
    return 'saved';
  }

  async deleteIncome(id: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
        throw new Error('User not authenticated.');
    }
    
    if (!id) {
      throw new Error('Income ID is required for deletion.');
    }
    await this.refreshConnectionStateForWrite();

    if (this.sharedOfflineData.isOfflineShared(profile)) {
      const records = await this.sharedOfflineData.read<ServiceIIncome>(profile, 'incomes');
      await this.sharedOfflineData.write(profile, 'incomes', 'remove', id, undefined,
        records[id]?.updatedAt || records[id]?.createdAt || null);
      return;
    }

    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(profile, 'incomes', 'remove', id);
      return;
    }

    let incomeRef: DatabaseReference;
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'incomes');
    if (canonicalRef && currentSpaceId) {
        incomeRef = ref(this.db, `space_data/${currentSpaceId}/incomes/${id}`);
    } else if (activeGroupId) {
        incomeRef = ref(this.db, `group_data/${activeGroupId}/incomes/${id}`);
    } else {
        incomeRef = ref(this.db, `users/${profile.uid}/incomes/${id}`);
    }
    await remove(incomeRef);
  }

  // The user-facing "Delete" action for a sale — cancels it instead of
  // erasing it. Excluded from getIncomes() (status !== 'void') so stock
  // and totals correct themselves automatically; the row itself is kept
  // forever for audit purposes. See deleteIncome() above for the (now
  // UI-unused) true hard-delete.
  async voidIncome(id: string, reason?: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!id) {
      throw new Error('Income ID is required for voiding.');
    }
    await this.refreshConnectionStateForWrite();
    if (this.sharedOfflineData.isOfflineShared(profile)) {
      const records = await this.sharedOfflineData.read<ServiceIIncome>(profile, 'incomes');
      await this.sharedOfflineData.write(profile, 'incomes', 'update', id, {
        status: 'void', voidedAt: new Date().toISOString(), voidedBy: profile.uid,
        voidedByName: profile.displayName || 'Unknown', voidReason: reason || null,
      }, records[id]?.updatedAt || records[id]?.createdAt || null);
      return;
    }
    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(profile, 'incomes', 'update', id, {
        status: 'void',
        voidedAt: new Date().toISOString(),
        voidedBy: profile.uid,
        voidedByName: profile.displayName || 'Unknown',
        voidReason: reason || null,
      });
      return;
    }

    let incomeRef: DatabaseReference;
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'incomes');
    if (canonicalRef && currentSpaceId) {
      incomeRef = ref(this.db, `space_data/${currentSpaceId}/incomes/${id}`);
    } else if (activeGroupId) {
      incomeRef = ref(this.db, `group_data/${activeGroupId}/incomes/${id}`);
    } else {
      incomeRef = ref(this.db, `users/${profile.uid}/incomes/${id}`);
    }

    await update(incomeRef, {
      status: 'void',
      voidedAt: new Date().toISOString(),
      voidedBy: profile.uid,
      voidedByName: profile.displayName || 'Unknown',
      voidReason: reason || null,
    });
  }

  getIncomesByYear(year: number): Observable<ServiceIIncome[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    return this.getIncomes(startDate, endDate);
  }
}
