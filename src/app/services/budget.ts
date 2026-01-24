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
  device: string;
  editedDevice?: string;
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

  async addBudget(
    budgetData: Omit<ServiceIBudget, 'id' | 'userId' | 'createdAt' | 'device' | 'editedDevice'>
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
      device: navigator.userAgent,
    };
    await push(this.getBudgetsRef(userId), newBudgetToSave);
  }

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
    await update(budgetRef, { ...updatedData, editedDevice: navigator.userAgent });
  }

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
