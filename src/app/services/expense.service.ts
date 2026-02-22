import { Injectable, inject } from '@angular/core';
import { Database, ref, push, set, update, remove, listVal } from '@angular/fire/database';
import { Observable, firstValueFrom, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AuthService } from './auth';

// Define the Expense interface to match the template expectations
export interface IExpense {
  id?: string; // Changed from key to id
  date: string;
  category: string;
  itemName: string;
  quantity: number;
  unit: string;
  price: number;
  totalCost: number; // Changed from total to totalCost
  currency: string;
  notes?: string;
  updatedBy?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ExpenseService {
  private db: Database = inject(Database);
  private authService: AuthService = inject(AuthService);

  private getExpensePath(): Observable<string | null> {
    return this.authService.userProfile$.pipe(
      switchMap(userProfile => {
        if (userProfile?.accountType === 'group' && userProfile.groupId) {
          return of(`group_data/${userProfile.groupId}/expenses`);
        } else if (userProfile?.accountType === 'personal' && userProfile.uid) {
          return of(`users/${userProfile.uid}/expenses`);
        }
        return of(null);
      })
    );
  }

  getExpenses(): Observable<IExpense[]> {
    return this.getExpensePath().pipe(
      switchMap(path => {
        if (!path) return of([]);
        // Use { keyField: 'id' } to match the IExpense interface and template
        return listVal<IExpense>(ref(this.db, path), { keyField: 'id' });
      })
    );
  }

  async addExpense(expenseData: Omit<IExpense, 'id'>): Promise<void> {
    const path = await firstValueFrom(this.getExpensePath());
    if (!path) throw new Error('Expense data path could not be determined.');

    const expensesRef = ref(this.db, path);
    const newExpenseRef = push(expensesRef);
    await set(newExpenseRef, expenseData);
  }

  async updateExpense(expenseId: string, expenseData: Partial<IExpense>): Promise<void> {
    const path = await firstValueFrom(this.getExpensePath());
    if (!path) throw new Error('Expense data path could not be determined.');

    const expenseRef = ref(this.db, `${path}/${expenseId}`);
    await update(expenseRef, expenseData);
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const path = await firstValueFrom(this.getExpensePath());
    if (!path) throw new Error('Expense data path could not be determined.');

    const expenseRef = ref(this.db, `${path}/${expenseId}`);
    await remove(expenseRef);
  }
}
