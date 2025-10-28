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

export interface ServiceIIncome {
  id?: string; // Make id optional as Firebase push will generate it
  date: string;
  amount: number;
  currency: string;
  description?: string;
  userId?: string; // Make userId optional as it's added by the service
  createdAt?: string; // Make createdAt optional as it's added by the service
}

@Injectable({
  providedIn: 'root',
})
export class IncomeService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);

  constructor() {
    // No direct loading from localStorage in constructor
  }

  private getIncomesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/incomes`);
  }

  /**
   * Adds a new income for the current user to Firebase.
   * @param incomeData The income data (excluding userId, id, createdAt).
   * @returns A Promise that resolves when the income is added.
   */
  async addIncome(
    incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt'>
  ): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }

    // The service adds userId and createdAt
    const newIncomeToSave: ServiceIIncome = {
      ...incomeData,
      userId,
      createdAt: new Date().toISOString(),
    };
    await push(this.getIncomesRef(userId), newIncomeToSave);
  }

  /**
   * Gets all incomes for the current user as an Observable from Firebase.
   * Attaches Firebase push IDs as 'id' property.
   * @returns An Observable of an array of Income objects.
   */
  getIncomes(): Observable<ServiceIIncome[]> {
    return this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user?.uid) {
          return listVal<ServiceIIncome>(this.getIncomesRef(user.uid), {
            keyField: 'id',
          });
        }
        return of([]); // Return empty array if no user
      })
    );
  }

  /**
   * Updates an existing income for the current user in Firebase.
   * @param incomeId The ID of the income to update.
   * @param updatedData The partial income data to update.
   * @returns A Promise that resolves when the income is updated.
   */
  async updateIncome(
    incomeId: string,
    updatedData: Partial<Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt'>>
  ): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!incomeId) {
      throw new Error('Income ID is required for update.');
    }
    const incomeRef = ref(this.db, `users/${userId}/incomes/${incomeId}`);
    await update(incomeRef, updatedData);
  }

  /**
   * Deletes an income for the current user from Firebase.
   * @param incomeId The ID of the income to delete.
   * @returns A Promise that resolves when the income is deleted.
   */
  async deleteIncome(id: string): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!id) {
      throw new Error('Income ID is required for deletion.');
    }
    const incomeRef = ref(this.db, `users/${userId}/incomes/${id}`);
    await remove(incomeRef);
  }

  // Method to get incomes for a specific year (useful for dashboard) - this will now filter from the Firebase stream
  getIncomesByYear(year: number): Observable<ServiceIIncome[]> {
    return this.getIncomes().pipe(
      // Get all incomes from Firebase
      map((incomes) =>
        incomes.filter((income) => new Date(income.date).getFullYear() === year)
      )
    );
  }
}
