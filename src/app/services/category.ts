import { Injectable, inject } from '@angular/core';
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

export interface ServiceICategory {
  id?: string; // Firebase push key
  name: string;
  userId?: string;
  groupId?: string;
  createdAt?: string;
}

// Assuming an expense structure might look like this for checking category usage
interface ServiceIExpense {
  id?: string;
  categoryId: string; // This would now contain the category NAME if you choose this option
  // other expense properties
}

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);
  private translateService = inject(TranslateService);

  // Add a Subject to emit category updates
  private categoryUpdatedSource = new Subject<{
    oldName: string;
    newName: string;
    userId: string;
  }>();
  categoryUpdated$ = this.categoryUpdatedSource.asObservable(); // Public observable

  constructor() {
    // No longer check for categories on new user registration here.
    // This will be handled by the onboarding component.
  }

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

  /**
   * Observes the correct list of categories based on the user's account type (personal or group).
   * @returns An Observable of an array of ServiceICategory objects.
   */
  getCategories(): Observable<ServiceICategory[]> {
    return this.authService.userProfile$.pipe(
      switchMap(profile => {
        if (profile?.groupId) {
          // User is in a group, fetch group categories from group_data
          return listVal<ServiceICategory>(this.getGroupCategoriesRef(profile.groupId), { keyField: 'id' });
        } else if (profile?.uid) {
          // User is not in a group (personal account), fetch personal categories
          return listVal<ServiceICategory>(this.getCategoriesRef(profile.uid), { keyField: 'id' });
        } else {
          // User not logged in or profile not loaded
          return of([]);
        }
      })
    );
  }

  /**
   * Sets up the default categories for a new personal account if they don't exist.
   * This should be called after the user explicitly chooses to use a personal account.
   */
  async setupPersonalAccountCategories(): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$.pipe(take(1)));
    if (!profile || profile.groupId) {
      // Don't add personal categories if user is in a group or not logged in.
      return;
    }

    const categoriesRef = this.getCategoriesRef(profile.uid);
    const snapshot = await get(categoriesRef);

    if (!snapshot.exists()) {
        const currentLang = this.translateService.currentLang || 'my';
        await this.addDefaultCategories(profile.uid, currentLang);
    }
  }

  /**
   * Adds a new category for the current user or their group.
   * @param categoryName The name of the category to add.
   * @returns A Promise that resolves when the category is added.
   */
  async addCategory(categoryName: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const newCategory: Omit<ServiceICategory, 'id'> = {
      name: categoryName.trim(),
      createdAt: new Date().toISOString(),
    };

    let categoriesRef: DatabaseReference;
    if (profile.groupId) {
      newCategory.groupId = profile.groupId;
      newCategory.userId = profile.uid; // To know who created it
      categoriesRef = this.getGroupCategoriesRef(profile.groupId);
    } else {
      newCategory.userId = profile.uid;
      categoriesRef = this.getCategoriesRef(profile.uid);
    }

    await push(categoriesRef, newCategory);
  }

  /**
   * Updates an existing category.
   * @param categoryId The ID of the category to update.
   * @param oldCategoryName The original name of the category.
   * @param newCategoryName The new name for the category.
   * @returns A Promise that resolves when the category is updated.
   */
  async updateCategory(categoryId: string, oldCategoryName: string, newCategoryName: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for update.');
    }

    let categoryRef: DatabaseReference;
    if (profile.groupId) {
      categoryRef = ref(this.db, `group_data/${profile.groupId}/categories/${categoryId}`);
    } else {
      categoryRef = ref(this.db, `users/${profile.uid}/categories/${categoryId}`);
    }

    await update(categoryRef, { name: newCategoryName.trim() });

    // Notify about the update for expenses adjustment
    this.categoryUpdatedSource.next({
      oldName: oldCategoryName,
      newName: newCategoryName,
      userId: profile.uid, // This might need adjustment based on group expense logic
    });
  }

  /**
   * Deletes a category.
   * @param categoryId The ID of the category to delete.
   * @returns A Promise that resolves when the category is deleted.
   */
  async deleteCategory(categoryId: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for deletion.');
    }

    let categoryRef: DatabaseReference;
    if (profile.groupId) {
      categoryRef = ref(this.db, `group_data/${profile.groupId}/categories/${categoryId}`);
    } else {
      categoryRef = ref(this.db, `users/${profile.uid}/categories/${categoryId}`);
    }

    await remove(categoryRef);
  }

  /**
   * Checks if a category is currently used in any expenses.
   * @param categoryId The ID of the category to check.
   * @returns A Promise that resolves to true if the category is used, false otherwise.
   */
  async isCategoryUsedInExpenses(categoryId: string): Promise<boolean> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    let categoryRef: DatabaseReference;
    let expensesRef: DatabaseReference;

    if (profile.groupId) {
      categoryRef = ref(this.db, `group_data/${profile.groupId}/categories/${categoryId}`);
      expensesRef = this.getGroupExpensesRef(profile.groupId);
    } else {
      categoryRef = ref(this.db, `users/${profile.uid}/categories/${categoryId}`);
      expensesRef = this.getExpensesRef(profile.uid);
    }

    const categorySnapshot = await get(categoryRef);
    const categoryName = categorySnapshot.val()?.name;

    if (!categoryName) {
      return false; // Category does not exist
    }

    const expensesQuery = query(expensesRef, orderByChild('category'), equalTo(categoryName));
    const snapshot = await get(expensesQuery);
    return snapshot.exists();
  }

  // ... rest of the service remains the same ...
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
