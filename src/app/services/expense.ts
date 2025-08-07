import { Injectable, inject } from '@angular/core';
import { Database, ref, push, remove, update, listVal, query, orderByChild, equalTo, DatabaseReference, objectVal, get } from '@angular/fire/database';
import { Observable, switchMap, map, of, firstValueFrom } from 'rxjs';
import { AuthService } from './auth';
import { CategoryService } from './category'; // Import CategoryService

// services/expense.ts (Example - adjust based on your actual interface)
export interface ServiceIExpense {
  id?: string;
  date: string;
  category: string;
  itemName: string;
  quantity: number;
  unit: string;
  price: number;
  currency: string; // <== ADD THIS
  totalCost: number; // Assuming this is derived
  createdAt: string;
  updatedAt: [''],
  userId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ExpenseService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);
  private categoryService = inject(CategoryService); // Inject CategoryService

  constructor() {
    this.categoryService.categoryUpdated$.subscribe(async ({ oldName, newName, userId }) => {
      // Logic to update expenses with the new category name
      await this.updateExpensesCategory(userId, oldName, newName);
    });
  }

  private getExpensesRef(userId: string): DatabaseReference {
    return ref(this.db, `expenseprofit/users/${userId}/expenses`);
  }

  /**
   * Adds a new expense for the current user.
   * @param expenseData The expense data (excluding userId, id, totalCost, createdAt).
   * @returns A Promise that resolves when the expense is added.
   */
  async addExpense(expenseData: Omit<ServiceIExpense, 'id' | 'userId' | 'totalCost' | 'createdAt'>): Promise<void> {
    const userId = (await firstValueFrom(
        this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
        throw new Error('User not authenticated.');
    }

    const totalCost = expenseData.quantity * expenseData.price;
    const newExpense: ServiceIExpense = {
      ...expenseData,
      userId,
      totalCost,
      createdAt: new Date().toISOString()
    };
    await push(this.getExpensesRef(userId), newExpense);
  }

  /**
   * Gets all expenses for the current user as an Observable.
   * Attaches Firebase push IDs as 'id' property.
   * @returns An Observable of an array of Expense objects.
   */
  getExpenses(): Observable<ServiceIExpense[]> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (user?.uid) {
          return listVal<ServiceIExpense>(this.getExpensesRef(user.uid), { keyField: 'id' });
        }
        return of([]); // Return empty array if no user
      })
    );
  }

  /**
   * Updates an existing expense for the current user.
   * @param expenseId The ID of the expense to update.
   * @param updatedData The partial expense data to update.
   * @returns A Promise that resolves when the expense is updated.
   */
  async updateExpense(expenseId: string, updatedData: Partial<Omit<ServiceIExpense, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    const userId = (await firstValueFrom(
        this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;

    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!expenseId) {
      throw new Error('Expense ID is required for update.');
    }

    // Recalculate totalCost if quantity or price is being updated
    if (updatedData.quantity !== undefined || updatedData.price !== undefined) {
      const currentExpenseRef = ref(this.db, `expenseprofit/users/${userId}/expenses/${expenseId}`);
      const snapshot = await get(currentExpenseRef);
      const currentExpense = snapshot.val() as ServiceIExpense;

      const quantity = updatedData.quantity !== undefined ? updatedData.quantity : currentExpense.quantity;
      const price = updatedData.price !== undefined ? updatedData.price : currentExpense.price;
      updatedData.totalCost = quantity * price;
    }

    const expenseRef = ref(this.db, `expenseprofit/users/${userId}/expenses/${expenseId}`);
    await update(expenseRef, updatedData);
  }

  /**
   * Deletes an expense for the current user.
   * @param expenseId The ID of the expense to delete.
   * @returns A Promise that resolves when the expense is deleted.
   */
  async deleteExpense(expenseId: string): Promise<void> {
    const userId = (await firstValueFrom(
        this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;

    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!expenseId) {
      throw new Error('Expense ID is required for deletion.');
    }
    const expenseRef = ref(this.db, `expenseprofit/users/${userId}/expenses/${expenseId}`);
    await remove(expenseRef);
  }

  /**
   * Updates the category name for all expenses belonging to a specific user
   * that match the old category name.
   * @param userId The ID of the user whose expenses are to be updated.
   * @param oldCategoryName The old category name to search for.
   * @param newCategoryName The new category name to set.
   * @returns A Promise that resolves when all matching expenses are updated.
   */
  private async updateExpensesCategory(userId: string, oldCategoryName: string, newCategoryName: string): Promise<void> {
    const expensesRef = this.getExpensesRef(userId);
    const snapshot = await get(query(expensesRef, orderByChild('category'), equalTo(oldCategoryName)));

    const updates: { [key: string]: any } = {};
    snapshot.forEach(childSnapshot => {
      updates[`${childSnapshot.key}/category`] = newCategoryName;
    });

    if (Object.keys(updates).length > 0) {
      await update(expensesRef, updates);
    //   console.log(`Updated ${Object.keys(updates).length} expenses from category '${oldCategoryName}' to '${newCategoryName}' for user ${userId}.`);
    } else {
    //   console.log(`No expenses found with category '${oldCategoryName}' for user ${userId}.`);
    }
  }

  /**
   * Gets all unique categories for the current user from Firebase.
   * @returns An Observable of a string array of categories.
   */
  getCategories(): Observable<string[]> {
    return this.authService.currentUser$.pipe(
        switchMap(user => {
        if (user?.uid) {
            // listVal with keyField 'id' returns an array of objects.
            // We need to map this to an array of category names.
            return listVal<{ name: string }>(ref(this.db, `expenseprofit/users/${user.uid}/categories`)).pipe(
            map(categories => categories.map(category => category.name))
            );
        }
        return of([]);
        })
    );
  }
}