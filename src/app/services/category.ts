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
import { Observable, switchMap, firstValueFrom, map, of, Subject } from 'rxjs';
import { AuthService } from './auth';

export interface ServiceICategory {
  id?: string; // Firebase push key
  name: string;
  userId: string;
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

  // Add a Subject to emit category updates
  private categoryUpdatedSource = new Subject<{
    oldName: string;
    newName: string;
    userId: string;
  }>();
  categoryUpdated$ = this.categoryUpdatedSource.asObservable(); // Public observable

  private getCategoriesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/categories`);
  }

  private getExpensesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/expenses`);
  }

  /**
   * Adds a new category for the current user.
   * @param categoryName The name of the category to add.
   * @returns A Promise that resolves when the category is added.
   */
  async addCategory(categoryName: string): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    // Store category name in a consistent format (trimmed, lowercase)
    const newCategory: Omit<ServiceICategory, 'id'> = {
      name: categoryName.trim(), // Trim spaces when adding
      userId: userId,
    };
    await push(this.getCategoriesRef(userId), newCategory);
  }

  /**
   * Gets all categories for the current user as an Observable.
   * Attaches Firebase push IDs as 'id' property.
   * @returns An Observable of an array of ServiceICategory objects.
   */
  getCategories(): Observable<ServiceICategory[]> {
    return this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user?.uid) {
          // Use listVal with keyField to include the Firebase key as 'id'
          return listVal<ServiceICategory>(this.getCategoriesRef(user.uid), {
            keyField: 'id',
          });
        }
        return of([]); // Return empty array if no user
      })
    );
  }

  /**
   * Updates an existing category for the current user.
   * @param categoryId The ID of the category to update.
   * @param newCategoryName The new name for the category.
   * @returns A Promise that resolves when the category is updated.
   */
  async updateCategory(
    categoryId: string,
    oldCategoryName: string,
    newCategoryName: string
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
    const categoryRef = ref(
      this.db,
      `users/${userId}/categories/${categoryId}`
    );
    // Update category name in a consistent format (trimmed)
    await update(categoryRef, { name: newCategoryName.trim() }); // Trim spaces when updating

    // Emit event after successful update
    this.categoryUpdatedSource.next({
      oldName: oldCategoryName,
      newName: newCategoryName,
      userId: userId,
    });
  }

  /**
   * Deletes a category for the current user.
   * @param categoryId The ID of the category to delete.
   * @returns A Promise that resolves when the category is deleted.
   */
  async deleteCategory(categoryId: string): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for deletion.');
    }
    const categoryRef = ref(
      this.db,
      `users/${userId}/categories/${categoryId}`
    );
    await remove(categoryRef);
  }

  /**
   * Checks if a category is currently used in any expenses for the current user.
   * This version assumes 'categoryId' in expenses stores the category NAME.
   * It performs a case-insensitive and trim-space comparison.
   * @param categoryId The ID of the category to check.
   * @returns A Promise that resolves to true if the category is used, false otherwise.
   */
  async isCategoryUsedInExpenses(categoryId: string): Promise<boolean> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      console.error('isCategoryUsedInExpenses - User not authenticated.');
      throw new Error('User not authenticated.');
    }

    // First, get the category name from the provided categoryId
    const categoryRef = ref(
      this.db,
      `users/${userId}/categories/${categoryId}`
    );

    const categorySnapshot = await get(categoryRef);
    const categoryName = categorySnapshot.val()?.name;

    if (!categoryName) {
      console.warn(
        'isCategoryUsedInExpenses - Category name not found for ID:',
        categoryId
      );
      return false;
    }

    // Normalize the category name for comparison (trimmed)
    const normalizedCategoryName = categoryName.trim();

    // Now, query expenses where categoryId (which holds the name) matches the normalized name
    const expensesRef = this.getExpensesRef(userId);
    const expensesQuery = query(
      expensesRef,
      orderByChild('category'),
      equalTo(normalizedCategoryName)
    );

    try {
      const snapshot = await get(expensesQuery);
      const result = snapshot.exists() && snapshot.size > 0;
      console.log(
        'isCategoryUsedInExpenses - Query result (snapshot exists and size > 0):',
        result
      );
      console.log('isCategoryUsedInExpenses - Snapshot value:', snapshot.val()); // Log actual data found
      return result;
    } catch (error) {
      console.error('Error checking category usage in expenses:', error);
      throw new Error('Failed to check category usage.');
    }
  }

  // --- New methods for default categories ---

  /**
   * Checks if a user already has any categories.
   * @param userId The UID of the user.
   * @returns A Promise that resolves to true if categories exist, false otherwise.
   */
  async hasCategories(userId: string): Promise<boolean> {
    const categoriesRef = this.getCategoriesRef(userId);
    const snapshot = await get(categoriesRef);
    return snapshot.exists() && snapshot.size > 0;
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
      };
      await push(this.getCategoriesRef(userId), newCategory);
    }
    console.log('All default categories added for user:', userId);
  }
}
