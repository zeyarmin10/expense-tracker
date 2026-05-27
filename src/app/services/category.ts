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

export interface ServiceICategory {
  id?: string; 
  name: string;
  userId?: string;
  groupId?: string;
  createdAt?: string;
}

interface ServiceIExpense {
  id?: string;
  categoryId: string; 
}

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  private db: Database = inject(Database);
  private translateService = inject(TranslateService);
  private authService = inject(forwardRef(() => AuthService));
  private spaceDataService = inject(SpaceDataService);

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

  private getGroupCategoriesRef(groupId: string): DatabaseReference {
    return ref(this.db, `group_data/${groupId}/categories`);
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
              const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(currentProfile, 'categories');
              return listVal<ServiceICategory>(canonicalRef || legacyRef, { keyField: 'id' });
            }),
            switchMap(stream => stream),
          );
        } else if (profile?.uid) {
          return of(profile).pipe(
            switchMap(async (currentProfile) => {
              if (!currentProfile) {
                return of([] as ServiceICategory[]);
              }
              const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(currentProfile, 'categories');
              return listVal<ServiceICategory>(canonicalRef || legacyRef, { keyField: 'id' });
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
    if (!profile || getActiveGroupId(profile)) {
      return;
    }

    const categoriesRef = this.getCategoriesRef(profile.uid);
    const snapshot = await get(categoriesRef);

    if (!snapshot.exists()) {
        const currentLang = this.translateService.currentLang || 'my';
        await this.addDefaultCategories(profile.uid, currentLang);
    }
  }

  async addCategory(categoryName: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const newCategory: Omit<ServiceICategory, 'id'> = {
      name: categoryName.trim(),
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

  async updateCategory(categoryId: string, newCategoryName: string): Promise<void> {
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
    const oldCategoryName = oldCategorySnap.val()?.name;

    if (oldCategoryName?.trim() === newCategoryName.trim()) {
      return;
    }

    await update(categoryRef, { name: newCategoryName.trim() });

    if (oldCategoryName) {
      // ✅ Expense တွေမှာ category name ကိုပါ တပြိုင်နက် update လုပ်မည်
      await this.updateExpensesByCategory(
        oldCategoryName,
        newCategoryName.trim(),
        profile
      );

      this.categoryUpdatedSource.next({
        oldName: oldCategoryName,
        newName: newCategoryName,
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

    await remove(categoryRef);
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

  async addDefaultCategories(userId: string, language: string): Promise<void> {
    const defaultCategories = [
      { en: 'Food', my: 'အစားအသောက်' },
      { en: 'Transportation', my: 'သယ်ယူပို့ဆောင်ရေး' },
      { en: 'Utilities', my: 'အသုံးစရိတ်' },
      { en: 'Entertainment', my: 'ဖျော်ဖြေရေး' },
      { en: 'Shopping', my: 'စျေးဝယ်' },
    ];

    for (const categoryData of defaultCategories) {
      const categoryName =
        language === 'my' ? categoryData.my : categoryData.en;
      const newCategory: Omit<ServiceICategory, 'id'> = {
        name: categoryName.trim(),
        userId: userId,
        createdAt: new Date().toISOString(),
      };
      await push(this.getCategoriesRef(userId), newCategory);
    }
  }

  async addDefaultGroupCategories(groupId: string, language: string): Promise<void> {
    const defaultCategories = [
      { en: 'Food', my: 'အစားအသောက်' },
      { en: 'Transportation', my: 'သယ်ယူပို့ဆောင်ရေး' },
      { en: 'Utilities', my: 'အသုံးစရိတ်' },
      { en: 'Entertainment', my: 'ဖျော်ဖြေရေး' },
      { en: 'Shopping', my: 'စျေးဝယ်' },
    ];

    const groupCategoriesRef = this.getGroupCategoriesRef(groupId);
    for (const categoryData of defaultCategories) {
      const categoryName =
        language === 'my' ? categoryData.my : categoryData.en;
      const newCategory: Omit<ServiceICategory, 'id'> = {
        name: categoryName.trim(),
        groupId: groupId,
        createdAt: new Date().toISOString(),
      };
      await push(groupCategoriesRef, newCategory);
    }
  }
}
