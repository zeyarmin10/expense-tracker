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
    // Subscribe to new user registrations to add default categories
    this.authService.newUserRegistered$.subscribe(userId => {
      this.checkAndAddDefaultCategories(userId);
    });
  }

  private getCategoriesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/categories`);
  }

  private getGroupCategoriesRef(groupId: string): DatabaseReference {
    return ref(this.db, `groups/${groupId}/categories`);
  }

  private getExpensesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/expenses`);
  }

  /**
   * Adds a new category for the current user or a group.
   * @param categoryName The name of the category to add.
   * @param groupId (Optional) The ID of the group to add the category to.
   * @returns A Promise that resolves when the category is added.
   */
  async addCategory(categoryName: string, groupId?: string): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    
    const newCategory: Omit<ServiceICategory, 'id'> = {
      name: categoryName.trim(),
      createdAt: new Date().toISOString(),
    };

    let categoriesRef: DatabaseReference;
    if (groupId) {
      newCategory.groupId = groupId;
      newCategory.userId = userId; // To know who created it
      categoriesRef = this.getGroupCategoriesRef(groupId);
    } else {
      newCategory.userId = userId;
      categoriesRef = this.getCategoriesRef(userId);
    }

    await push(categoriesRef, newCategory);
  }

  /**
   * Gets all categories for a user or a group as an Observable.
   * If no userId and no groupId is provided, it defaults to the currently authenticated user.
   * @param userId (Optional) The UID of the user to fetch categories for.
   * @param groupId (Optional) The ID of the group to fetch categories for.
   * @returns An Observable of an array of ServiceICategory objects.
   */
  getCategories(userId?: string, groupId?: string): Observable<ServiceICategory[]> {
    if (groupId) {
      return listVal<ServiceICategory>(this.getGroupCategoriesRef(groupId), { keyField: 'id' });
    }
    
    if (userId) {
      return listVal<ServiceICategory>(this.getCategoriesRef(userId), { keyField: 'id' });
    } else {
      return this.authService.currentUser$.pipe(
        switchMap((user) => {
          if (user?.uid) {
            return listVal<ServiceICategory>(this.getCategoriesRef(user.uid), { keyField: 'id' });
          }
          return of([]); // Return empty array if no user
        })
      );
    }
  }

  /**
   * Updates an existing category.
   * @param categoryId The ID of the category to update.
   * @param newCategoryName The new name for the category.
   * @param groupId (Optional) The ID of the group the category belongs to.
   * @returns A Promise that resolves when the category is updated.
   */
  async updateCategory(
    categoryId: string,
    oldCategoryName: string,
    newCategoryName: string,
    groupId?: string
  ): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for update.');
    }

    let categoryRef;
    if (groupId) {
        categoryRef = ref(this.db, `groups/${groupId}/categories/${categoryId}`);
    } else {
        categoryRef = ref(this.db, `users/${userId}/categories/${categoryId}`);
    }
    
    await update(categoryRef, { name: newCategoryName.trim() });

    this.categoryUpdatedSource.next({
      oldName: oldCategoryName,
      newName: newCategoryName,
      userId: userId,
    });
  }

  /**
   * Deletes a category.
   * @param categoryId The ID of the category to delete.
   * @param groupId (Optional) The ID of the group the category belongs to.
   * @returns A Promise that resolves when the category is deleted.
   */
  async deleteCategory(categoryId: string, groupId?: string): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for deletion.');
    }

    let categoryRef;
    if (groupId) {
        categoryRef = ref(this.db, `groups/${groupId}/categories/${categoryId}`);
    } else {
        categoryRef = ref(this.db, `users/${userId}/categories/${categoryId}`);
    }

    await remove(categoryRef);
  }

  /**
   * Checks if a category is currently used in any expenses.
   * @param categoryId The ID of the category to check.
   * @param groupId (Optional) The ID of the group the category belongs to.
   * @returns A Promise that resolves to true if the category is used, false otherwise.
   */
  async isCategoryUsedInExpenses(categoryId: string, groupId?: string): Promise<boolean> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      console.error('isCategoryUsedInExpenses - User not authenticated.');
      throw new Error('User not authenticated.');
    }

    let categoryRef;
    let expensesRef;

    if (groupId) {
        categoryRef = ref(this.db, `groups/${groupId}/categories/${categoryId}`);
        expensesRef = ref(this.db, `groups/${groupId}/expenses`);
    } else {
        categoryRef = ref(this.db, `users/${userId}/categories/${categoryId}`);
        expensesRef = this.getExpensesRef(userId);
    }
    
    const categorySnapshot = await get(categoryRef);
    const categoryName = categorySnapshot.val()?.name;

    if (!categoryName) {
      console.warn('isCategoryUsedInExpenses - Category name not found for ID:', categoryId);
      return false;
    }

    const normalizedCategoryName = categoryName.trim();
    const expensesQuery = query(
      expensesRef,
      orderByChild('category'),
      equalTo(normalizedCategoryName)
    );

    try {
      const snapshot = await get(expensesQuery);
      return snapshot.exists() && snapshot.size > 0;
    } catch (error) {
      console.error('Error checking category usage in expenses:', error);
      throw new Error('Failed to check category usage.');
    }
  }

  private async checkAndAddDefaultCategories(userId: string): Promise<void> {
    const categories$ = this.getCategories(userId);
    const existingCategories = await firstValueFrom(categories$.pipe(take(1)));

    if (existingCategories.length === 0) {
      const currentLang = this.translateService.currentLang || 'my';
      await this.addDefaultCategories(userId, currentLang);
    }
  }

  /**
   * Adds 5 default categories for a given user ID based on the specified language.
   * This function should be called only once per user upon their first login/registration.
   * @param userId The UID of the user for whom to add default categories.
   * @param language The language to use for category names ('en' for English, 'my' for Burmese).
   * @returns A Promise that resolves when all default categories are added.
   */
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

  /**
   * Adds default categories to a group.
   * This should be called when a new group is created.
   * @param groupId The ID of the group.
   * @param language The language for the default category names ('en' or 'my').
   */
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
