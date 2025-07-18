import { Injectable, inject } from '@angular/core';
import { Database, ref, push, set, update, remove, listVal, query, orderByChild, equalTo } from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom } from 'rxjs';
import { AuthService } from './auth';
import { DataICategory, DataIExpense } from '../models/data'; // Import interfaces

@Injectable({
  providedIn: 'root'
})
export class DataManagerService {
  private db: Database = inject(Database);
  private authService: AuthService = inject(AuthService);

  // Helper to get the user-specific path in RTDB
  private getUserDataPath(dataType: 'categories' | 'expenses'): Observable<string | null> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (user && user.uid) {
          return new Observable<string>(observer => {
            observer.next(`users/${user.uid}/${dataType}`);
            observer.complete();
          });
        }
        return new Observable<null>(observer => {
          observer.next(null);
          observer.complete();
        });
      })
    );
  }

  // --- Category Management ---

  /**
   * Creates a new category for the current user.
   * @param categoryName The name of the category.
   * @returns Promise<void>
   */
  async addCategory(categoryName: string): Promise<void> {
      const userPathObservable = this.getUserDataPath('categories');
      const path = await firstValueFrom(userPathObservable); // Convert observable to promise to get value once
      console.log('path', path);
      if (!path) throw new Error("User not authenticated or path not found.");

    const categoryRef = push(ref(this.db, path)); // Push generates a unique ID
    console.log('categoryRef', categoryRef);
    const newCategory: DataICategory = {
      id: categoryRef.key!, // Get the generated key
      name: categoryName,
      userId: (await firstValueFrom(this.authService.currentUser$))!.uid // Ensure userId is linked
    };

    console.log('newCategory', newCategory)
    
    return set(categoryRef, newCategory);
  }

  /**
   * Retrieves all categories for the current user.
   * @returns Observable<Category[]>
   */
  getCategories(): Observable<DataICategory[]> {
    return this.getUserDataPath('categories').pipe(
      switchMap(path => {
        if (!path) return new Observable<DataICategory[]>(observer => { observer.next([]); observer.complete(); });
        return listVal<DataICategory>(ref(this.db, path), { keyField: 'id' });
      })
    );
  }

  /**
   * Edits an existing category for the current user.
   * @param categoryId The ID of the category to edit.
   * @param newName The new name for the category.
   * @returns Promise<void>
   */
  async editCategory(categoryId: string, newName: string): Promise<void> {
    const userPathObservable = this.getUserDataPath('categories');
    const path = await firstValueFrom(userPathObservable);
    if (!path) throw new Error("User not authenticated or path not found.");

    const categoryRef = ref(this.db, `${path}/${categoryId}`);
    return update(categoryRef, { name: newName });
  }

  /**
   * Deletes a category for the current user.
   * @param categoryId The ID of the category to delete.
   * @returns Promise<void>
   */
  async deleteCategory(categoryId: string): Promise<void> {
    const userPathObservable = this.getUserDataPath('categories');
    const path = await firstValueFrom(userPathObservable);
    if (!path) throw new Error("User not authenticated or path not found.");

    const categoryRef = ref(this.db, `${path}/${categoryId}`);
    return remove(categoryRef);
  }

  // --- Expense Management ---

  /**
   * Adds a new expense for the current user.
   * @param expense The expense object to add.
   * @returns Promise<void>
   */
  async addExpense(expense: Omit<DataIExpense, 'id' | 'userId'>): Promise<void> {
    const userPathObservable = this.getUserDataPath('expenses');
    const path = await firstValueFrom(userPathObservable);
    if (!path) throw new Error("User not authenticated or path not found.");

    const expenseRef = push(ref(this.db, path)); // Generates a unique ID
    const newExpense: DataIExpense = {
      id: expenseRef.key!,
      userId: (await firstValueFrom(this.authService.currentUser$))!.uid,
      ...expense
    };
    return set(expenseRef, newExpense);
  }

  /**
   * Retrieves all expenses for the current user.
   * @returns Observable<Expense[]>
   */
  getExpenses(): Observable<DataIExpense[]> {
    return this.getUserDataPath('expenses').pipe(
      switchMap(path => {
        if (!path) return new Observable<DataIExpense[]>(observer => { observer.next([]); observer.complete(); });
        // listVal with keyField 'id' will include the Firebase generated key in the object
        return listVal<DataIExpense>(ref(this.db, path), { keyField: 'id' });
      })
    );
  }

  /**
   * Edits an existing expense for the current user.
   * @param expense The updated expense object (must include id).
   * @returns Promise<void>
   */
  async editExpense(expense: DataIExpense): Promise<void> {
    const userPathObservable = this.getUserDataPath('expenses');
    const path = await userPathObservable.toPromise();
    if (!path) throw new Error("User not authenticated or path not found.");

    const expenseRef = ref(this.db, `${path}/${expense.id}`);
    // Spread operator to update all fields, excluding id itself from the update object if it's there
    return update(expenseRef, { ...expense, id: undefined });
  }

  /**
   * Deletes an expense for the current user.
   * @param expenseId The ID of the expense to delete.
   * @returns Promise<void>
   */
  async deleteExpense(expenseId: string): Promise<void> {
    const userPathObservable = this.getUserDataPath('expenses');
    const path = await userPathObservable.toPromise();
    if (!path) throw new Error("User not authenticated or path not found.");

    const expenseRef = ref(this.db, `${path}/${expenseId}`);
    return remove(expenseRef);
  }
}