import { Injectable, inject } from '@angular/core';
import { Database, ref, push, remove, update, listVal, query, orderByChild, equalTo, DatabaseReference } from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom, map, of, Subject } from 'rxjs'; // Import Subject
import { AuthService } from './auth';

export interface ServiceICategory {
  id?: string; // Firebase push key
  name: string;
  userId: string;
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
    const newCategory: Omit<ServiceICategory, 'id'> = {
      name: categoryName,
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
    await update(categoryRef, { name: newCategoryName });

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
}