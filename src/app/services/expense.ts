import { Injectable, inject } from '@angular/core';
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
import { UserDataService } from './user-data';
import { GroupService } from './group.service';

export type ServiceIExpense = IExpense & { 
  id: string; 
  totalCost: number;
  updatedByName?: string;
  createdByName?: string; // Add createdByName to the service model
};

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private db: Database = inject(Database);
  private authService: AuthService = inject(AuthService);
  private userDataService: UserDataService = inject(UserDataService);
  private groupService: GroupService = inject(GroupService);

  constructor() {}

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
            async (snapshot) => {
              const expensesData = snapshot.val();
              if (!expensesData) {
                observer.next([]);
                return;
              }

              const promises = Object.keys(expensesData).map(async (key) => {
                const expense = expensesData[key] as IExpense;
                let updatedByName: string | undefined = undefined;
                let createdByName: string | undefined = expense.createdByName;

                if (expense.updatedBy) {
                  const userProfile = await firstValueFrom(this.userDataService.getUserProfile(expense.updatedBy));
                  updatedByName = userProfile?.displayName || 'Unknown User';
                }

                // Fetch creator's current name if not already set
                if (expense.userId && !createdByName) {
                  const userProfile = await firstValueFrom(this.userDataService.getUserProfile(expense.userId));
                  createdByName = userProfile?.displayName;
                }

                return {
                  id: key,
                  ...expense,
                  totalCost: expense.quantity * expense.price,
                  createdByName: createdByName || 'Former Member',
                  updatedByName: updatedByName,
                } as ServiceIExpense;
              });
              
              const expenses = await Promise.all(promises);
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
      IExpense,
      'id' | 'userId' | 'groupId' | 'totalCost' | 'device' | 'editedDevice' | 'updatedAt' | 'updatedBy' | 'currency' | 'createdByName'
    >
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const parser = new UAParser();
    const result = parser.getResult();
    const device = `${result.browser.name} on ${result.os.name}, Model: ${result.device.model || 'Unknown'} (${result.device.vendor || 'Unknown'})`;

    const totalCost = expenseData.quantity * expenseData.price;
    let currency: string;
    let expensesRef: DatabaseReference;

    if (profile.groupId) {
      const groupSettings = await firstValueFrom(this.groupService.getGroupSettings(profile.groupId));
      currency = groupSettings?.currency || profile.currency; // Fallback to user's currency
      expensesRef = this.getGroupExpensesRef(profile.groupId);
    } else {
      currency = profile.currency;
      expensesRef = this.getExpensesRef(profile.uid);
    }

    const newExpense: Omit<IExpense, 'id' | 'updatedAt' | 'editedDevice' | 'updatedBy'> = {
      ...expenseData,
      userId: profile.uid, // createdById
      createdByName: profile.displayName || 'Anonymous', // Save current displayName
      currency: currency,
      totalCost,
      createdAt: new Date().toISOString(),
      device: device,
    };

    if (profile.groupId) {
      (newExpense as any).groupId = profile.groupId;
    }

    await push(expensesRef, newExpense);
  }

  async updateExpense(
    expenseId: string,
    updates: Partial<Omit<IExpense, 'id' | 'userId' | 'groupId' | 'totalCost'>>
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
      updatedBy: profile.uid
    };

    if (updates.quantity || updates.price) {
        const currentExpense = await this.getExpense(expenseId);
        const quantity = updates.quantity || currentExpense.quantity;
        const price = updates.price || currentExpense.price;
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
              async (snapshot) => {
                if (snapshot.exists()) {
                  const expense = snapshot.val() as IExpense;
                  let updatedByName: string | undefined = undefined;
                  let createdByName: string | undefined = expense.createdByName;

                  if (expense.updatedBy) {
                    const userProfile = await firstValueFrom(this.userDataService.getUserProfile(expense.updatedBy));
                    updatedByName = userProfile?.displayName || 'Unknown User';
                  }

                  // Fetch creator's current name if not already set
                  if (expense.userId && !createdByName) {
                    const userProfile = await firstValueFrom(this.userDataService.getUserProfile(expense.userId));
                    createdByName = userProfile?.displayName;
                  }

                  resolve({
                    id: snapshot.key!,
                    ...expense,
                    totalCost: expense.quantity * expense.price,
                    createdByName: createdByName || 'Former Member',
                    updatedByName: updatedByName,
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
