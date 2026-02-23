import { Injectable } from '@angular/core';
import {
  Database,
  ref,
  onValue,
  push,
  update,
  remove,
  DatabaseReference,
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

  private getExpensesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/expenses`);
  }

  private getGroupExpensesRef(groupId: string): DatabaseReference {
    return ref(this.db, `group_data/${groupId}/expenses`);
  }

  private getExpenseRef(userId: string, expenseId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/expenses/${expenseId}`);
  }

  private getGroupExpenseRef(groupId: string, expenseId: string): DatabaseReference {
    return ref(this.db, `group_data/${groupId}/expenses/${expenseId}`);
  }

  getExpenses(): Observable<ServiceIExpense[]> {
    return this.authService.userProfile$.pipe(
      switchMap(profile => {
        if (!profile) {
          return of([]);
        }
        const expensesRef = profile.groupId
          ? this.getGroupExpensesRef(profile.groupId)
          : this.getExpensesRef(profile.uid);

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
      'id' | 'userId' | 'groupId' | 'totalCost' | 'device' | 'editedDevice' | 'updatedAt'
    >
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const parser = new UAParser();
    const result = parser.getResult();
    const device = `${result.browser.name} on ${result.os.name}, Model: ${result.device.model || 'Unknown'} (${result.device.vendor || 'Unknown'})`;

    const totalCost = expenseData['quantity'] * expenseData['price'];
    const newExpense: Omit<ServiceIExpense, 'id' | 'updatedAt' | 'editedDevice'> = {
      ...expenseData,
      userId: profile.uid,
      totalCost,
      createdAt: new Date().toISOString(),
      device: device,
    };

    let expensesRef: DatabaseReference;
    if (profile.groupId) {
        (newExpense as any).groupId = profile.groupId;
        expensesRef = this.getGroupExpensesRef(profile.groupId);
    } else {
        expensesRef = this.getExpensesRef(profile.uid);
    }

    await push(expensesRef, newExpense);
  }

  async updateExpense(
    expenseId: string,
    updates: Partial<Omit<ServiceIExpense, 'id' | 'userId' | 'groupId' | 'totalCost'>>
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const parser = new UAParser();
    const result = parser.getResult();
    const editedDevice = `${result.browser.name} on ${result.os.name}, Model: ${result.device.model || 'Unknown'} (${result.device.vendor || 'Unknown'})`;

    const expenseRef = profile.groupId
        ? this.getGroupExpenseRef(profile.groupId, expenseId)
        : this.getExpenseRef(profile.uid, expenseId);

    const updatedData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
      editedDevice: editedDevice,
    };

    if (updates['quantity'] || updates['price']) {
        const currentExpense = await this.getExpense(expenseId);
        const quantity = updates['quantity'] || currentExpense.quantity;
        const price = updates['price'] || currentExpense['price'];
        updatedData.totalCost = quantity * price;
      }

    await update(expenseRef, updatedData);
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    const expenseRef = profile.groupId
        ? this.getGroupExpenseRef(profile.groupId, expenseId)
        : this.getExpenseRef(profile.uid, expenseId);
    await remove(expenseRef);
  }

  getExpense(expenseId: string): Promise<ServiceIExpense> {
    return firstValueFrom(
      this.authService.userProfile$.pipe(
        switchMap((profile) => {
          if (!profile) {
            throw new Error('User not authenticated.');
          }
          const expenseRef = profile.groupId
            ? this.getGroupExpenseRef(profile.groupId, expenseId)
            : this.getExpenseRef(profile.uid, expenseId);

          return new Promise<ServiceIExpense>((resolve, reject) => {
            onValue(
              expenseRef,
              (snapshot) => {
                if (snapshot.exists()) {
                  const expense = snapshot.val();
                  resolve({
                    id: snapshot.key,
                    ...expense,
                    totalCost: expense.quantity * expense['price'],
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
