import { Injectable, inject } from '@angular/core';
import {
  Database,
  ref,
  onValue,
  push,
  update,
  remove,
  DatabaseReference,
  query,
  orderByChild,
  equalTo,
  get,
  startAt,
  endAt,
  Query,
} from '@angular/fire/database';
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { map, switchMap, catchError, filter, take } from 'rxjs/operators';
import { DataIExpense as IExpense } from '../core/models/data';
import { AuthService } from './auth';
import { UAParser } from 'ua-parser-js';
import { UserDataService, UserProfile } from './user-data';
import { GroupService } from './group.service';

export type ServiceIExpense = IExpense & { 
  id: string; 
  unit?: string;
  totalCost: number;
  updatedByName?: string;
  createdByName?: string; // Add createdByName to the service model
  userDisplayName?: string;
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

  getExpenses(startDate?: Date, endDate?: Date): Observable<ServiceIExpense[]> {
    return this.authService.userProfile$.pipe(
      filter((profile): profile is UserProfile => profile !== null),
      take(1),
      switchMap(profile => {
        const baseRef = profile.groupId
          ? this.getGroupExpensesRef(profile.groupId)
          : this.getExpensesRef(profile.uid);

        let expensesQuery: Query = baseRef;

        if (startDate && endDate) {
          const start = startDate.toISOString().split('T')[0];
          const end = endDate.toISOString().split('T')[0];
          expensesQuery = query(baseRef, orderByChild('date'), startAt(start), endAt(end));
        }

        return from(get(expensesQuery)).pipe(
          switchMap(async (snapshot) => {
            const expensesData = snapshot.val();
            if (!expensesData) {
              return [];
            }

            const userIds = new Set<string>();
            Object.values(expensesData).forEach((expense: any) => {
              if (expense.userId) userIds.add(expense.userId);
              if (expense.updatedBy) userIds.add(expense.updatedBy);
            });

            const userProfilePromises = [...userIds].map(userId =>
              firstValueFrom(this.userDataService.getUserProfile(userId)).then(profile => ({ userId, profile }))
            );

            const userProfilesArray = await Promise.all(userProfilePromises);
            const userProfiles = userProfilesArray.reduce((acc, { userId, profile }) => {
              if (profile) {
                acc[userId] = profile;
              }
              return acc;
            }, {} as { [userId: string]: UserProfile });

            const expenses = Object.keys(expensesData).map((key) => {
              const expense = expensesData[key] as IExpense;
              let createdByName = expense.createdByName;
              if(expense.userId && !createdByName) {
                 createdByName = userProfiles[expense.userId]?.displayName;
              }
              const updatedByName = expense.updatedBy ? userProfiles[expense.updatedBy]?.displayName : undefined;

              return {
                id: key,
                ...expense,
                totalCost: expense.quantity * expense.price,
                createdByName: createdByName || 'Former Member',
                updatedByName: updatedByName,
                userDisplayName: createdByName || 'Former Member',
              } as ServiceIExpense;
            });

            return expenses;
          }),
          catchError((error) => {
            console.error('Error fetching expenses:', error);
            return of([]);
          })
        );
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
      currency = groupSettings?.currency || profile.currency;
      expensesRef = this.getGroupExpensesRef(profile.groupId);
    } else {
      currency = profile.currency;
      expensesRef = this.getExpensesRef(profile.uid);
    }

    const newExpense: Omit<IExpense, 'id' | 'updatedAt' | 'editedDevice' | 'updatedBy'> = {
      ...expenseData,
      userId: profile.uid,
      createdByName: profile.displayName || 'Anonymous',
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
                    userDisplayName: createdByName || 'Former Member',
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

  async isCategoryInUse(categoryName: string): Promise<boolean> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile) {
      return false;
    }

    const expensesRef = profile.groupId
      ? this.getGroupExpensesRef(profile.groupId)
      : this.getExpensesRef(profile.uid);

    const categoryQuery = query(
      expensesRef,
      orderByChild('category'),
      equalTo(categoryName)
    );

    try {
      const snapshot = await get(categoryQuery);
      return snapshot.exists();
    } catch (error) {
      console.error('Error checking category usage:', error);
      return false;
    }
  }
}
