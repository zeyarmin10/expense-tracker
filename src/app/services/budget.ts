import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, of, firstValueFrom } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  Database,
  ref,
  push,
  remove,
  update,
  listVal,
  DatabaseReference,
} from '@angular/fire/database';
import { AuthService } from './auth';

export interface ServiceIBudget {
  id?: string;
  type: 'monthly' | 'yearly' | 'weekly';
  period?: string;
  category?: string;
  categoryId?: string;
  description?: string;
  amount: number;
  currency: string;
  userId?: string;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class BudgetService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);

  constructor() {}

  private getBudgetsRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/budgets`);
  }

  /**
   * Adds a new budget record for the current user to Firebase.
   * @param budgetData The budget data.
   * @returns A Promise that resolves when the budget is added.
   */
  async addBudget(
    budgetData: Omit<ServiceIBudget, 'id' | 'userId' | 'createdAt'>
  ): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }

    const newBudgetToSave: ServiceIBudget = {
      ...budgetData,
      userId,
      createdAt: new Date().toISOString(),
    };
    await push(this.getBudgetsRef(userId), newBudgetToSave);
  }

  /**
   * Gets all budget records for the current user as an Observable from Firebase.
   * Attaches Firebase push IDs as 'id' property.
   * @returns An Observable of an array of ServiceIBudget objects.
   */
  getBudgets(): Observable<ServiceIBudget[]> {
    return this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user?.uid) {
          return listVal<ServiceIBudget>(this.getBudgetsRef(user.uid), {
            keyField: 'id',
          });
        }
        return of([]);
      })
    );
  }

  /**
   * Updates an existing budget record for the current user in Firebase.
   * @param budgetId The ID of the budget to update.
   * @param updatedData The partial budget data to update.
   * @returns A Promise that resolves when the budget is updated.
   */
  async updateBudget(
    budgetId: string,
    updatedData: Partial<Omit<ServiceIBudget, 'id' | 'userId' | 'createdAt'>>
  ): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!budgetId) {
      throw new Error('Budget ID is required for update.');
    }
    const budgetRef = ref(this.db, `users/${userId}/budgets/${budgetId}`);
    await update(budgetRef, updatedData);
  }

  /**
   * Deletes a budget record for the current user from Firebase.
   * @param budgetId The ID of the budget to delete.
   * @returns A Promise that resolves when the budget is deleted.
   */
  async deleteBudget(id: string): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!id) {
      throw new Error('Budget ID is required for deletion.');
    }
    const budgetRef = ref(this.db, `users/${userId}/budgets/${id}`);
    await remove(budgetRef);
  }
}
