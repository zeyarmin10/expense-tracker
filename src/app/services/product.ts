import { Injectable, inject, forwardRef } from '@angular/core';
import {
  Database,
  ref,
  push,
  remove,
  update,
  listVal,
  query,
  orderByChild,
  equalTo,
  DatabaseReference,
  get,
} from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom, of, take } from 'rxjs';
import { AuthService } from './auth';
import { getActiveGroupId, UserProfile } from './user-data';
import { SpaceDataService } from './space-data.service';
import { SpaceSwitchLoadingService } from './space-switch-loading.service';
import { getExpenseLineItems, ServiceIExpense } from './expense';
import { getIncomeLineItems, ServiceIIncome } from './income';

export interface ServiceIProduct {
  id?: string;
  name: string;
  unit?: string;
  // Default selling price — set at creation (or edited later) so the Sales
  // form can auto-fill Unit Price the moment this product is picked.
  sellingPrice?: number;
  // Scanned/typed once at creation (or edited later) — looked up by the POS
  // cart's barcode scanner to find which product was just scanned.
  barcode?: string;
  userId?: string;
  groupId?: string;
  createdAt?: string;
  // Absent/true = shown in "Add Item" pickers; false = hidden from new
  // selections but kept intact for historical purchase/sale records — see
  // deactivateProduct()/activateProduct().
  isActive?: boolean;
}

/**
 * Maps an Error thrown by ProductService to a translation key, for the
 * Inventory page + the shared product-modal to show a friendly message
 * instead of the raw thrown text.
 */
export function getProductErrorMessage(error: any): string | null {
  switch (error?.message) {
    case 'Product name already exists.':
      return 'PRODUCT_ALREADY_EXISTS';
    case 'Barcode already in use.':
      return 'PRODUCT_BARCODE_ALREADY_EXISTS';
    default:
      return null;
  }
}

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  private db: Database = inject(Database);
  private authService = inject(forwardRef(() => AuthService));
  private spaceDataService = inject(SpaceDataService);
  private spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);

  constructor() {}

  getProducts(): Observable<ServiceIProduct[]> {
    return this.authService.userProfile$.pipe(
      switchMap((profile: UserProfile | null) => {
        if (!profile?.uid) {
          return of([] as ServiceIProduct[]);
        }
        return of(profile).pipe(
          switchMap(async (currentProfile) => {
            if (!currentProfile) {
              return of([] as ServiceIProduct[]);
            }
            const { canonicalRef, legacyRef } = await firstValueFrom(
              this.spaceSwitchLoadingService.track(
                of(null).pipe(
                  switchMap(() => this.spaceDataService.getActiveCollectionContext(currentProfile, 'products')),
                ),
              ),
            );
            return this.spaceSwitchLoadingService.track(
              listVal<ServiceIProduct>(canonicalRef || legacyRef, { keyField: 'id' }),
            );
          }),
          switchMap((stream) => stream),
        );
      }),
    );
  }

  private async assertProductNameAvailable(
    trimmedName: string,
    excludeProductId?: string,
  ): Promise<void> {
    const existingProducts = await firstValueFrom(this.getProducts().pipe(take(1)));
    const isDuplicate = existingProducts.some(
      (product) =>
        product.id !== excludeProductId &&
        product.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (isDuplicate) {
      throw new Error('Product name already exists.');
    }
  }

  // A shared barcode across two products would make the POS scanner add the
  // wrong item, so this is checked the same way name uniqueness already is.
  private async assertBarcodeAvailable(
    trimmedBarcode: string,
    excludeProductId?: string,
  ): Promise<void> {
    const existingProducts = await firstValueFrom(this.getProducts().pipe(take(1)));
    const isDuplicate = existingProducts.some(
      (product) =>
        product.id !== excludeProductId &&
        !!product.barcode &&
        product.barcode === trimmedBarcode,
    );
    if (isDuplicate) {
      throw new Error('Barcode already in use.');
    }
  }

  async getProductByBarcode(barcode: string): Promise<ServiceIProduct | null> {
    const trimmedBarcode = barcode.trim();
    if (!trimmedBarcode) {
      return null;
    }
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'products');
    const productsRef = canonicalRef || legacyRef;
    const snapshot = await get(query(productsRef, orderByChild('barcode'), equalTo(trimmedBarcode)));
    if (!snapshot.exists()) {
      return null;
    }
    const val = snapshot.val() as Record<string, Omit<ServiceIProduct, 'id'>>;
    const [id, product] = Object.entries(val)[0];
    return { id, ...product };
  }

  async addProduct(name: string, unit?: string, sellingPrice?: number, barcode?: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const trimmedName = name.trim();
    await this.assertProductNameAvailable(trimmedName);
    const trimmedBarcode = barcode?.trim();
    if (trimmedBarcode) {
      await this.assertBarcodeAvailable(trimmedBarcode);
    }

    const newProduct: Omit<ServiceIProduct, 'id'> = {
      name: trimmedName,
      ...(unit ? { unit: unit.trim() } : {}),
      ...(sellingPrice && sellingPrice > 0 ? { sellingPrice } : {}),
      ...(trimmedBarcode ? { barcode: trimmedBarcode } : {}),
      createdAt: new Date().toISOString(),
    };

    const activeGroupId = getActiveGroupId(profile);
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'products');
    const productsRef = canonicalRef || legacyRef;

    newProduct.userId = profile.uid;
    if (activeGroupId) {
      newProduct.groupId = activeGroupId;
    }

    await push(productsRef, newProduct);
  }

  async updateProduct(
    productId: string,
    newName: string,
    unit?: string,
    sellingPrice?: number | null,
    barcode?: string | null,
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!productId) {
      throw new Error('Product ID is required for update.');
    }

    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'products');
    const productRef: DatabaseReference = canonicalRef && currentSpaceId
      ? ref(this.db, `space_data/${currentSpaceId}/products/${productId}`)
      : activeGroupId
        ? ref(this.db, `group_data/${activeGroupId}/products/${productId}`)
        : ref(this.db, `users/${profile.uid}/products/${productId}`);

    const trimmedNewName = newName.trim();
    await this.assertProductNameAvailable(trimmedNewName, productId);
    const trimmedBarcode = barcode?.trim();
    if (trimmedBarcode) {
      await this.assertBarcodeAvailable(trimmedBarcode, productId);
    }

    const updateData: { name: string; unit?: string; sellingPrice?: number | null; barcode?: string | null } = { name: trimmedNewName };
    if (unit !== undefined) {
      updateData.unit = unit.trim();
    }
    if (sellingPrice !== undefined) {
      // Firebase RTDB removes the key when set to null — used to clear a
      // previously-set selling price.
      updateData.sellingPrice = sellingPrice && sellingPrice > 0 ? sellingPrice : null;
    }
    if (barcode !== undefined) {
      updateData.barcode = trimmedBarcode || null;
    }
    await update(productRef, updateData);
  }

  async deleteProduct(productId: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!productId) {
      throw new Error('Product ID is required for deletion.');
    }

    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'products');

    const primaryPath = canonicalRef && currentSpaceId
      ? `space_data/${currentSpaceId}/products/${productId}`
      : activeGroupId
        ? `group_data/${activeGroupId}/products/${productId}`
        : `users/${profile.uid}/products/${productId}`;

    const deleteOps: Promise<void>[] = [remove(ref(this.db, primaryPath))];

    if (canonicalRef && currentSpaceId) {
      const legacyPath = activeGroupId
        ? `group_data/${activeGroupId}/products/${productId}`
        : `users/${profile.uid}/products/${productId}`;
      deleteOps.push(remove(ref(this.db, legacyPath)).catch(() => {}));
    }

    await Promise.all(deleteOps);
  }

  async isProductInUse(productId: string): Promise<boolean> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const expenseContext = await this.spaceDataService.getActiveCollectionContext(profile, 'expenses');
    const incomeContext = await this.spaceDataService.getActiveCollectionContext(profile, 'incomes');
    const expensesRef = expenseContext.canonicalRef || expenseContext.legacyRef;
    const incomesRef = incomeContext.canonicalRef || incomeContext.legacyRef;

    // Indexed queries first — cheap, and cover every legacy single-item
    // purchase/sale (the common case).
    const [expenseSnapshot, incomeSnapshot] = await Promise.all([
      get(query(expensesRef, orderByChild('productId'), equalTo(productId))),
      get(query(incomesRef, orderByChild('productId'), equalTo(productId))),
    ]);
    if (expenseSnapshot.exists() || incomeSnapshot.exists()) {
      return true;
    }

    // RTDB can't index into lineItems[].productId, so a product used only
    // via a POS-cart (multi-item) purchase/sale would otherwise slip past
    // the check above and be reported as "not in use" — fetch the full
    // lists once and scan their line items directly.
    const [allExpensesSnapshot, allIncomesSnapshot] = await Promise.all([
      get(expensesRef),
      get(incomesRef),
    ]);
    const expensesVal = (allExpensesSnapshot.val() || {}) as Record<string, ServiceIExpense>;
    const incomesVal = (allIncomesSnapshot.val() || {}) as Record<string, ServiceIIncome>;

    const usedInExpenseLineItems = Object.values(expensesVal).some((e) =>
      getExpenseLineItems(e).some((li) => li.productId === productId)
    );
    if (usedInExpenseLineItems) {
      return true;
    }
    return Object.values(incomesVal).some((i) =>
      getIncomeLineItems(i).some((li) => li.productId === productId)
    );
  }

  async deactivateProduct(productId: string): Promise<void> {
    await this.setProductActive(productId, false);
  }

  async activateProduct(productId: string): Promise<void> {
    await this.setProductActive(productId, true);
  }

  private async setProductActive(productId: string, isActive: boolean): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'products');

    const primaryPath = canonicalRef && currentSpaceId
      ? `space_data/${currentSpaceId}/products/${productId}`
      : activeGroupId
        ? `group_data/${activeGroupId}/products/${productId}`
        : `users/${profile.uid}/products/${productId}`;

    await update(ref(this.db, primaryPath), { isActive });
  }
}
