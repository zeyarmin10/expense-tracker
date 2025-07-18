import { Injectable, inject } from '@angular/core';
import { Database, ref, push, remove, update, listVal, DatabaseReference, objectVal } from '@angular/fire/database';
import { Observable, switchMap } from 'rxjs';
import { AuthService } from './auth'; // To get current user UID if categories were per-user

export interface ServiceICategory {
  id?: string; // Firebase push ID
  name: string; // အမျိုးအစား
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private db: Database = inject(Database);
  private authService = inject(AuthService); // Inject AuthService if categories were per-user

  private get categoriesRef(): DatabaseReference {
    // For now, categories are global. If you want them per-user:
    // return ref(this.db, `categories/${this.authService.currentUserId}`);
    return ref(this.db, 'categories');
  }

  /**
   * Adds a new category to the Realtime Database.
   * @param categoryName The name of the category to add.
   * @returns A Promise that resolves when the category is added.
   */
  async addCategory(categoryName: string): Promise<void> {
    if (!categoryName || categoryName.trim() === '') {
      throw new Error('Category name cannot be empty.');
    }
    const newCategory: ServiceICategory = {
      name: categoryName.trim(),
      createdAt: new Date().toISOString()
    };
    await push(this.categoriesRef, newCategory);
  }

  /**
   * Gets all categories as an Observable.
   * Attaches Firebase push IDs as 'id' property.
   * @returns An Observable of an array of Category objects.
   */
  getCategories(): Observable<ServiceICategory[]> {
    return listVal<ServiceICategory>(this.categoriesRef, { keyField: 'id' });
  }

  /**
   * Updates an existing category.
   * @param categoryId The ID of the category to update.
   * @param newName The new name for the category.
   * @returns A Promise that resolves when the category is updated.
   */
  async updateCategory(categoryId: string, newName: string): Promise<void> {
    if (!categoryId) {
      throw new Error('Category ID is required for update.');
    }
    if (!newName || newName.trim() === '') {
      throw new Error('Category name cannot be empty.');
    }
    const categoryRef = ref(this.db, `categories/${categoryId}`);
    await update(categoryRef, { name: newName.trim() });
  }

  /**
   * Deletes a category.
   * @param categoryId The ID of the category to delete.
   * @returns A Promise that resolves when the category is deleted.
   */
  async deleteCategory(categoryId: string): Promise<void> {
    if (!categoryId) {
      throw new Error('Category ID is required for deletion.');
    }
    const categoryRef = ref(this.db, `categories/${categoryId}`);
    await remove(categoryRef);
  }
}