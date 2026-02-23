import { Injectable, inject } from '@angular/core';
import {
  Database,
  list,
  push,
  ref,
  remove,
  update,
  query,
  orderByChild,
  equalTo,
  get,
  set
} from '@angular/fire/database';
import { Observable, of, firstValueFrom } from 'rxjs';
import { map, switchMap, catchError, filter } from 'rxjs/operators';
import { AuthService } from './auth';
import { UserProfile } from './user-data';

// Interface updated to re-include missing fields
export interface IExpense {
  id?: string;
  date: string;
  category: string;
  itemName: string;
  quantity: number;
  unit?: string;
  price: number;
  currency: string;
  totalCost: number;
  createdAt?: string;
  userId?: string;
  createdByName?: string;  // Re-added for display purposes
  updatedAt?: string;
  updatedByName?: string;  // Re-added to fix component error
  selectedDate?: string;
  editedDevice?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private db: Database = inject(Database);
  private authService: AuthService = inject(AuthService);

  constructor() {}

  private _getExpensesPath(userProfile: UserProfile | null): string | null {
    if (!userProfile) return null;

    if (userProfile.accountType === 'group' && userProfile.groupId) {
      return `group_data/${userProfile.groupId}/expenses`;
    } else {
      return `users/${userProfile.uid}/expenses`;
    }
  }

  getExpenses(): Observable<IExpense[]> {
    return this.authService.userProfile$.pipe(
      switchMap(userProfile => {
        const path = this._getExpensesPath(userProfile);
        if (!path) {
          return of([]);
        }
        const expensesRef = ref(this.db, path);
        return list(expensesRef).pipe(
          map(changes =>
            changes.map(c => ({
              id: c.snapshot.key ?? undefined,
              ...(c.snapshot.val() as IExpense),
            }))
          ),
          catchError(error => {
            console.error('Error fetching expenses from path:', path, error);
            return of([]);
          })
        );
      })
    );
  }

  async addExpense(expense: Omit<IExpense, 'id'>): Promise<void> {
    const userProfile = await firstValueFrom(this.authService.userProfile$.pipe(filter(p => !!p))) as UserProfile;
    const path = this._getExpensesPath(userProfile);
    if (!path) throw new Error('Could not determine expense path for the user.');

    const expensesRef = ref(this.db, path);
    const newExpenseRef = push(expensesRef);

    const newExpense: Partial<IExpense> = {
      ...expense,
      createdAt: new Date().toISOString(),
      userId: userProfile.uid,
      createdByName: userProfile.displayName, // Set creator name
      updatedAt: new Date().toISOString(),
      updatedByName: userProfile.displayName, // Set initial updater name
      selectedDate: expense.date,
      editedDevice: 'Web Browser'
    };

    await set(newExpenseRef, newExpense);
  }

  async updateExpense(expenseId: string, updatedExpense: Partial<IExpense>): Promise<void> {
    const userProfile = await firstValueFrom(this.authService.userProfile$.pipe(filter(p => !!p))) as UserProfile;
    const path = this._getExpensesPath(userProfile);
    if (!path) throw new Error('Could not determine expense path for update.');
    if (!expenseId) throw new Error('Expense ID is required for an update.');

    const expenseRef = ref(this.db, `${path}/${expenseId}`);
    const updates: Partial<IExpense> = {
        ...updatedExpense,
        updatedAt: new Date().toISOString(),
        updatedByName: userProfile.displayName // Update the name of the updater
    };
    await update(expenseRef, updates);
  }
  
  async deleteExpense(expenseId: string): Promise<void> {
    const userProfile = await firstValueFrom(this.authService.userProfile$.pipe(filter(p => !!p))) as UserProfile;
    const path = this._getExpensesPath(userProfile);
    if (!path) throw new Error('Could not determine expense path for delete.');

    const expenseRef = ref(this.db, `${path}/${expenseId}`);
    await remove(expenseRef);
  }

  async isCategoryInUse(categoryName: string): Promise<boolean> {
    const userProfile = await firstValueFrom(this.authService.userProfile$.pipe(filter(p => !!p))) as UserProfile;
    const path = this._getExpensesPath(userProfile);
    if (!path) return false;

    const expensesRef = ref(this.db, path);
    const categoryQuery = query(expensesRef, orderByChild('category'), equalTo(categoryName));

    try {
      const snapshot = await get(categoryQuery);
      return snapshot.exists();
    } catch (error) {
      console.error('Error checking category usage:', error);
      return false;
    }
  }
}
