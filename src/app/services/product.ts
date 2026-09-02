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

export interface ServiceIProduct {
  id?: string;
  name: string;
  unit?: string;
  userId?: string;
  groupId?: string;
  createdAt?: string;
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

  async addProduct(name: string, unit?: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const trimmedName = name.trim();
    await this.assertProductNameAvailable(trimmedName);

    const newProduct: Omit<ServiceIProduct, 'id'> = {
      name: trimmedName,
      ...(unit ? { unit: unit.trim() } : {}),
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

  async updateProduct(productId: string, newName: string, unit?: string): Promise<void> {
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

    const updateData: { name: string; unit?: string } = { name: trimmedNewName };
    if (unit !== undefined) {
      updateData.unit = unit.trim();
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

    const [expenseSnapshot, incomeSnapshot] = await Promise.all([
      get(query(expensesRef, orderByChild('productId'), equalTo(productId))),
      get(query(incomesRef, orderByChild('productId'), equalTo(productId))),
    ]);

    return expenseSnapshot.exists() || incomeSnapshot.exists();
  }
}
