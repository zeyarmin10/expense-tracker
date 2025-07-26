import { Injectable, inject } from '@angular/core';
import { Database, ref, push, remove, update, listVal, query, orderByChild, equalTo, DatabaseReference, get, child } from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom, map, of, Subject } from 'rxjs'; // Import Subject
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
  providedIn: 'root'
})
export class CategoryService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);

  // Add a Subject to emit category updates
  private categoryUpdatedSource = new Subject<{ oldName: string; newName: string; userId: string }>();
  categoryUpdated$ = this.categoryUpdatedSource.asObservable(); // Public observable

  private getCategoriesRef(userId: string): DatabaseReference {
    return ref(this.db, `expenseprofit/users/${userId}/categories`);
  }

  private getExpensesRef(userId: string): DatabaseReference {
    return ref(this.db, `expenseprofit/users/${userId}/expenses`);
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
      userId: userId
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
      switchMap(user => {
        if (user?.uid) {
          // Use listVal with keyField to include the Firebase key as 'id'
          return listVal<ServiceICategory>(this.getCategoriesRef(user.uid), { keyField: 'id' });
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
  async updateCategory(categoryId: string, oldCategoryName: string, newCategoryName: string): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for update.');
    }
    const categoryRef = ref(this.db, `expenseprofit/users/${userId}/categories/${categoryId}`);
    // Update category name in a consistent format (trimmed)
    await update(categoryRef, { name: newCategoryName.trim() }); // Trim spaces when updating

    // Emit event after successful update
    this.categoryUpdatedSource.next({ oldName: oldCategoryName, newName: newCategoryName, userId: userId });
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
    const categoryRef = ref(this.db, `expenseprofit/users/${userId}/categories/${categoryId}`);
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
    console.log('isCategoryUsedInExpenses called for categoryId:', categoryId);
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    console.log('isCategoryUsedInExpenses - userId:', userId);

    if (!userId) {
      console.error('isCategoryUsedInExpenses - User not authenticated.');
      throw new Error('User not authenticated.');
    }

    // First, get the category name from the provided categoryId
    const categoryRef = ref(this.db, `expenseprofit/users/${userId}/categories/${categoryId}`);
    console.log('isCategoryUsedInExpenses - categoryRef path:', categoryRef.toString());

    const categorySnapshot = await get(categoryRef);
    const categoryName = categorySnapshot.val()?.name;
    console.log('isCategoryUsedInExpenses - categoryName from snapshot:', categoryName);

    if (!categoryName) {
      console.warn('isCategoryUsedInExpenses - Category name not found for ID:', categoryId);
      return false;
    }

    // Normalize the category name for comparison (trim spaces, convert to lowercase)
    const normalizedCategoryName = categoryName.trim(); // .toLowerCase() removed for Burmese text comparison
    console.log('isCategoryUsedInExpenses - Normalized categoryName:', normalizedCategoryName);

    // Now, query expenses where categoryId (which holds the name) matches the normalized name
    const expensesRef = this.getExpensesRef(userId);
    // Note: orderByChild and equalTo perform exact matches. For truly robust case-insensitive
    // and space-insensitive matching, you might need to store normalized names in expenses
    // or fetch all expenses and filter client-side (less efficient for large datasets).
    // For now, we'll assume the expense 'category' field is also consistently trimmed.
    const expensesQuery = query(expensesRef, orderByChild('category'), equalTo(normalizedCategoryName)); // Changed 'categoryId' to 'category' based on your image
    console.log('isCategoryUsedInExpenses - expensesQuery for normalizedCategoryName:', normalizedCategoryName);

    try {
      const snapshot = await get(expensesQuery);
      const result = snapshot.exists() && snapshot.size > 0;
      console.log('isCategoryUsedInExpenses - Query result (snapshot exists and size > 0):', result);
      console.log('isCategoryUsedInExpenses - Snapshot value:', snapshot.val()); // Log actual data found
      return result;
    } catch (error) {
      console.error('Error checking category usage in expenses:', error);
      throw new Error('Failed to check category usage.');
    }
  }
}
