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
  child,
} from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom, map, of, Subject, take } from 'rxjs';
import { AuthService } from './auth';
import { TranslateService } from '@ngx-translate/core';
import { getActiveGroupId, UserProfile } from './user-data'; // Import UserProfile
import { SpaceDataService } from './space-data.service';
import { SpaceSwitchLoadingService } from './space-switch-loading.service';

export interface ServiceICategory {
  id?: string;
  name: string;
  icon?: string;
  userId?: string;
  groupId?: string;
  createdAt?: string;
}

interface ServiceIExpense {
  id?: string;
  categoryId: string;
}

/**
 * Maps an Error thrown by CategoryService to a translation key, for the
 * add/edit call sites (category page + the shared category-modal) to show
 * a friendly message instead of the raw thrown text.
 */
export function getCategoryErrorMessage(error: any): string | null {
  switch (error?.message) {
    case 'Category name already exists.':
      return 'CATEGORY_ALREADY_EXISTS';
    default:
      return null;
  }
}

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  private db: Database = inject(Database);
  private translateService = inject(TranslateService);
  private authService = inject(forwardRef(() => AuthService));
  private spaceDataService = inject(SpaceDataService);
  private spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);

  private categoryUpdatedSource = new Subject<{
    oldName: string;
    newName: string;
    userId: string;
  }>();
  categoryUpdated$ = this.categoryUpdatedSource.asObservable();

  constructor() {}

  private getCategoriesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/categories`);
  }

  private getExpensesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/expenses`);
  }

  private getGroupExpensesRef(groupId: string): DatabaseReference {
    return ref(this.db, `group_data/${groupId}/expenses`);
  }

  getCategories(): Observable<ServiceICategory[]> {
    return this.authService.userProfile$.pipe(
      switchMap((profile: UserProfile | null) => { // Explicitly type the profile
        const activeGroupId = getActiveGroupId(profile);
        if (activeGroupId) {
          return of(profile).pipe(
            switchMap(async (currentProfile) => {
              if (!currentProfile) {
                return of([] as ServiceICategory[]);
              }
              const { canonicalRef, legacyRef } = await firstValueFrom(
                this.spaceSwitchLoadingService.track(
                  of(null).pipe(
                    switchMap(() => this.spaceDataService.getActiveCollectionContext(currentProfile, 'categories')),
                  ),
                ),
              );
              return this.spaceSwitchLoadingService.track(
                listVal<ServiceICategory>(canonicalRef || legacyRef, { keyField: 'id' }),
              );
            }),
            switchMap(stream => stream),
          );
        } else if (profile?.uid) {
          return of(profile).pipe(
            switchMap(async (currentProfile) => {
              if (!currentProfile) {
                return of([] as ServiceICategory[]);
              }
              const { canonicalRef, legacyRef } = await firstValueFrom(
                this.spaceSwitchLoadingService.track(
                  of(null).pipe(
                    switchMap(() => this.spaceDataService.getActiveCollectionContext(currentProfile, 'categories')),
                  ),
                ),
              );
              return this.spaceSwitchLoadingService.track(
                listVal<ServiceICategory>(canonicalRef || legacyRef, { keyField: 'id' }),
              );
            }),
            switchMap(stream => stream),
          );
        } else {
          return of([]);
        }
      })
    );
  }

  async setupPersonalAccountCategories(): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$.pipe(take(1))) as UserProfile | null;
    if (!profile?.uid || getActiveGroupId(profile)) {
      return;
    }

    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'categories');
    const categoriesRef = canonicalRef || legacyRef;
    const snapshot = await get(categoriesRef);

    if (!snapshot.exists()) {
      const currentLang = this.translateService.currentLang || 'my';
      await this.addDefaultCategories(profile.uid, currentLang, categoriesRef);
    }
  }

  /**
   * Throws if another category (excluding `excludeCategoryId`, used when
   * renaming) already has this name, case-insensitively. Centralized here
   * so every entry point (the categories page's add/edit, and the shared
   * category-modal's add/edit) is protected the same way, rather than each
   * UI re-implementing its own check and some quietly missing it.
   */
  private async assertCategoryNameAvailable(
    trimmedName: string,
    excludeCategoryId?: string,
  ): Promise<void> {
    const existingCategories = await firstValueFrom(this.getCategories());
    const isDuplicate = existingCategories.some(
      (category) =>
        category.id !== excludeCategoryId &&
        category.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (isDuplicate) {
      throw new Error('Category name already exists.');
    }
  }

  async addCategory(categoryName: string, icon?: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const trimmedName = categoryName.trim();
    await this.assertCategoryNameAvailable(trimmedName);

    const newCategory: Omit<ServiceICategory, 'id'> = {
      name: trimmedName,
      ...(icon ? { icon } : {}),
      createdAt: new Date().toISOString(),
    };

    let categoriesRef: DatabaseReference;
    const activeGroupId = getActiveGroupId(profile);
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'categories');
    if (activeGroupId) {
      newCategory.groupId = activeGroupId;
      newCategory.userId = profile.uid;
      categoriesRef = canonicalRef || legacyRef;
    } else {
      newCategory.userId = profile.uid;
      categoriesRef = canonicalRef || legacyRef;
    }

    await push(categoriesRef, newCategory);
  }

  async updateCategory(categoryId: string, newCategoryName: string, icon?: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for update.');
    }

    let categoryRef: DatabaseReference;
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'categories');
    if (canonicalRef && currentSpaceId) {
      categoryRef = ref(this.db, `space_data/${currentSpaceId}/categories/${categoryId}`);
    } else if (activeGroupId) {
      categoryRef = ref(this.db, `group_data/${activeGroupId}/categories/${categoryId}`);
    } else {
      categoryRef = ref(this.db, `users/${profile.uid}/categories/${categoryId}`);
    }
    
    const oldCategorySnap = await get(categoryRef);
    const oldCategoryData = oldCategorySnap.val();
    const oldCategoryName = oldCategoryData?.name;
    const oldIcon = oldCategoryData?.icon;

    const trimmedNewName = newCategoryName.trim();
    const nameUnchanged = oldCategoryName?.trim() === trimmedNewName;
    const iconUnchanged = icon === undefined || icon === oldIcon;
    if (nameUnchanged && iconUnchanged) {
      return;
    }

    if (!nameUnchanged) {
      await this.assertCategoryNameAvailable(trimmedNewName, categoryId);
    }

    const updateData: { name: string; icon?: string } = { name: trimmedNewName };
    if (icon !== undefined) updateData.icon = icon;
    await update(categoryRef, updateData);

    if (oldCategoryName) {
      // ✅ Expense တွေမှာ category name ကိုပါ တပြိုင်နက် update လုပ်မည်
      await this.updateExpensesByCategory(
        oldCategoryName,
        trimmedNewName,
        profile
      );

      this.categoryUpdatedSource.next({
        oldName: oldCategoryName,
        newName: trimmedNewName,
        userId: profile.uid,
      });
    }
  }

  // ── Bulk update expenses when category name changes ──────────────────────
  private async updateExpensesByCategory(
    oldName: string,
    newName: string,
    profile: UserProfile
  ): Promise<void> {
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const expenseContext = await this.spaceDataService.getActiveCollectionContext(profile, 'expenses');
    const expensesRef = expenseContext.canonicalRef || expenseContext.legacyRef;

    // category name ဖြင့် filter ဆွဲ
    const expensesQuery = query(
      expensesRef,
      orderByChild('category'),
      equalTo(oldName)
    );

    const snapshot = await get(expensesQuery);
    if (!snapshot.exists()) return;

    // batch update — Promise.all ဖြင့် တပြိုင်နက် update
    const updates: Promise<void>[] = [];
    snapshot.forEach((childSnap) => {
      const directRef = currentSpaceId && expenseContext.canonicalRef
        ? ref(this.db, `space_data/${currentSpaceId}/expenses/${childSnap.key}`)
        : activeGroupId
        ? ref(this.db, `group_data/${activeGroupId}/expenses/${childSnap.key}`)
        : ref(this.db, `users/${profile.uid}/expenses/${childSnap.key}`);
      updates.push(update(directRef, { category: newName }));
    });

    await Promise.all(updates);
  }
  // ─────────────────────────────────────────────────────────────────────────

  async deleteCategory(categoryId: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for deletion.');
    }

    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'categories');

    const deleteOps: Promise<void>[] = [];

    if (canonicalRef && currentSpaceId) {
      deleteOps.push(remove(ref(this.db, `space_data/${currentSpaceId}/categories/${categoryId}`)));
      // Also remove from legacy path so backfill doesn't restore on next reload
      const legacyPath = activeGroupId
        ? `group_data/${activeGroupId}/categories/${categoryId}`
        : `users/${profile.uid}/categories/${categoryId}`;
      deleteOps.push(remove(ref(this.db, legacyPath)).catch(() => {}));
    } else if (activeGroupId) {
      deleteOps.push(remove(ref(this.db, `group_data/${activeGroupId}/categories/${categoryId}`)));
    } else {
      deleteOps.push(remove(ref(this.db, `users/${profile.uid}/categories/${categoryId}`)));
    }

    await Promise.all(deleteOps);
  }

  async isCategoryUsedInExpenses(categoryId: string): Promise<boolean> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    let categoryRef: DatabaseReference;
    let expensesRef: DatabaseReference;

    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const categoryContext = await this.spaceDataService.getActiveCollectionContext(profile, 'categories');
    const expenseContext = await this.spaceDataService.getActiveCollectionContext(profile, 'expenses');
    if (categoryContext.canonicalRef && expenseContext.canonicalRef && currentSpaceId) {
      categoryRef = ref(this.db, `space_data/${currentSpaceId}/categories/${categoryId}`);
      expensesRef = expenseContext.canonicalRef;
    } else if (activeGroupId) {
      categoryRef = ref(this.db, `group_data/${activeGroupId}/categories/${categoryId}`);
      expensesRef = this.getGroupExpensesRef(activeGroupId);
    } else {
      categoryRef = ref(this.db, `users/${profile.uid}/categories/${categoryId}`);
      expensesRef = this.getExpensesRef(profile.uid);
    }

    const categorySnapshot = await get(categoryRef);
    const categoryName = categorySnapshot.val()?.name;

    if (!categoryName) {
      return false; 
    }

    const expensesQuery = query(expensesRef, orderByChild('category'), equalTo(categoryName));
    const snapshot = await get(expensesQuery);
    return snapshot.exists();
  }

  private async checkAndAddDefaultCategories(userId: string): Promise<void> {
    const categories$ = this.getCategories();
    const existingCategories = await firstValueFrom(categories$.pipe(take(1)));

    if (existingCategories.length === 0) {
      const currentLang = this.translateService.currentLang || 'my';
      await this.addDefaultCategories(userId, currentLang);
    }
  }

  async addDefaultCategories(userId: string, language: string, categoriesRef?: DatabaseReference): Promise<void> {
    const defaultCategories = [
      { en: 'Food',           my: 'အစားအသောက်',           icon: 'utensils'     },
      { en: 'Transportation', my: 'သယ်ယူပို့ဆောင်ရေး',   icon: 'car'          },
      { en: 'Utilities',      my: 'အသုံးစရိတ်',            icon: 'lightbulb'    },
      { en: 'Entertainment',  my: 'ဖျော်ဖြေရေး',           icon: 'gamepad'      },
      { en: 'Shopping',       my: 'စျေးဝယ်',               icon: 'shopping-bag' },
    ];

    const targetRef = categoriesRef || this.getCategoriesRef(userId);
    await Promise.all(defaultCategories.map((categoryData) => {
      const categoryName =
        language === 'my' ? categoryData.my : categoryData.en;
      const newCategory: Omit<ServiceICategory, 'id'> = {
        name: categoryName.trim(),
        icon: categoryData.icon,
        userId: userId,
        createdAt: new Date().toISOString(),
      };
      return push(targetRef, newCategory);
    }));
  }

  async addDefaultGroupCategories(groupId: string, language: string): Promise<void> {
    const defaultCategories = [
      { en: 'Food',           my: 'အစားအသောက်',           icon: 'utensils'     },
      { en: 'Transportation', my: 'သယ်ယူပို့ဆောင်ရေး',   icon: 'car'          },
      { en: 'Utilities',      my: 'အသုံးစရိတ်',            icon: 'lightbulb'    },
      { en: 'Entertainment',  my: 'ဖျော်ဖြေရေး',           icon: 'gamepad'      },
      { en: 'Shopping',       my: 'စျေးဝယ်',               icon: 'shopping-bag' },
    ];

    // Write straight to the canonical space_data path — group_data is legacy
    // (read-only-for-backfill at this point per SpaceDataService), and a
    // brand-new group has no legacy data to justify writing there anyway.
    const groupCategoriesRef = ref(this.db, `space_data/${groupId}/categories`);
    await Promise.all(defaultCategories.map((categoryData) => {
      const categoryName =
        language === 'my' ? categoryData.my : categoryData.en;
      const newCategory: Omit<ServiceICategory, 'id'> = {
        name: categoryName.trim(),
        icon: categoryData.icon,
        groupId: groupId,
        createdAt: new Date().toISOString(),
      };
      return push(groupCategoriesRef, newCategory);
    }));
  }
}
