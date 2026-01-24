import { Injectable } from '@angular/core';
import {
  Database,
  ref,
  onValue,
  push,
  update,
  remove,
} from '@angular/fire/database';
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { DataIExpense as IExpense } from '../core/models/data';
import { AuthService } from './auth';
import { UAParser } from 'ua-parser-js';

export type ServiceIExpense = IExpense & { id: string; totalCost: number; };

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  constructor(private db: Database, private authService: AuthService) {}

  private getExpensesRef(userId: string) {
    return ref(this.db, `users/${userId}/expenses`);
  }

  private getExpenseRef(userId:string, expenseId: string) {
    return ref(this.db, `users/${userId}/expenses/${expenseId}`);
  }

  getExpenses(): Observable<ServiceIExpense[]> {
    return this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (!user) {
          return of([]);
        }
        const expensesRef = this.getExpensesRef(user.uid);
        return new Observable<ServiceIExpense[]>((observer) => {
          onValue(
            expensesRef,
            (snapshot) => {
              const expensesData = snapshot.val();
              const expenses = expensesData
                ? Object.keys(expensesData).map(
                    (key) => {
                      const expense = expensesData[key];
                      return {
                        id: key,
                        ...expense,
                        totalCost: expense.quantity * expense.price,
                      } as ServiceIExpense;
                    }
                  )
                : [];
              observer.next(expenses);
            },
            (error) => observer.error(error)
          );
        });
      }),
      catchError((error) => {
        console.error('Error fetching expenses:', error);
        return of([]);
      })
    );
  }

  async addExpense(
    expenseData: Omit<
      ServiceIExpense,
      'id' | 'userId' | 'totalCost' | 'device' | 'editedDevice' | 'updatedAt'
    >
  ): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }

    const parser = new UAParser();
    const result = parser.getResult();
    const device = `${result.browser.name} on ${result.os.name}, Model: ${result.device.model || 'Unknown'} (${result.device.vendor || 'Unknown'})`;

    const totalCost = expenseData['quantity'] * expenseData['price'];
    const newExpense: Omit<ServiceIExpense, 'id' | 'updatedAt' | 'editedDevice'> = {
      ...expenseData,
      userId,
      totalCost,
      createdAt: new Date().toISOString(),
      device: device,
    };
    await push(this.getExpensesRef(userId), newExpense);
  }

  async updateExpense(
    expenseId: string,
    updates: Partial<Omit<ServiceIExpense, 'id' | 'userId' | 'totalCost'>>
  ): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }

    const parser = new UAParser();
    const result = parser.getResult();
    const editedDevice = `${result.browser.name} on ${result.os.name}, Model: ${result.device.model || 'Unknown'} (${result.device.vendor || 'Unknown'})`;

    const expenseRef = this.getExpenseRef(userId, expenseId);
    const updatedData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
      editedDevice: editedDevice,
    };

    if (updates['quantity'] || updates['price']) {
      const currentExpense = await this.getExpense(expenseId);
      const quantity = updates['quantity'] || currentExpense.quantity;
      const price = updates['price'] || currentExpense.price;
      updatedData.totalCost = quantity * price;
    }

    await update(expenseRef, updatedData);
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    const expenseRef = this.getExpenseRef(userId, expenseId);
    await remove(expenseRef);
  }

  getExpense(expenseId: string): Promise<ServiceIExpense> {
    return firstValueFrom(
      this.authService.currentUser$.pipe(
        switchMap((user) => {
          if (!user) {
            throw new Error('User not authenticated.');
          }
          const expenseRef = this.getExpenseRef(user.uid, expenseId);
          return new Promise<ServiceIExpense>((resolve, reject) => {
            onValue(
              expenseRef,
              (snapshot) => {
                if (snapshot.exists()) {
                  const expense = snapshot.val();
                  resolve({
                    id: snapshot.key,
                    ...expense,
                    totalCost: expense.quantity * expense.price,
                  } as ServiceIExpense);
                } else {
                  reject('Expense not found.');
                }
              },
              (error) => reject(error)
            );
          });
        })
      )
    );
  }
}
