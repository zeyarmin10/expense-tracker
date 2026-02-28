import { Injectable, inject } from '@angular/core';
import { Observable, of, firstValueFrom, from } from 'rxjs';
import { switchMap, map, catchError, filter, take } from 'rxjs/operators';
import {
  Database,
  ref,
  push,
  remove,
  update,
  DatabaseReference,
  get,
} from '@angular/fire/database';
import { AuthService } from './auth';
import { UserProfile } from './user-data';

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
  groupId?: string; // Added for group budgets
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

  private getGroupBudgetsRef(groupId: string): DatabaseReference {
    return ref(this.db, `group_data/${groupId}/budgets`);
  }

  async addBudget(
    budgetData: Omit<ServiceIBudget, 'id' | 'userId' | 'groupId' | 'createdAt' | 'device' | 'editedDevice'>
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const newBudget: Omit<ServiceIBudget, 'id'> = {
      ...budgetData,
      userId: profile.uid,
      createdAt: new Date().toISOString(),
      device: navigator.userAgent,
    };

    let budgetsRef: DatabaseReference;
    if (profile.groupId) {
      newBudget.groupId = profile.groupId;
      budgetsRef = this.getGroupBudgetsRef(profile.groupId);
    } else {
      budgetsRef = this.getBudgetsRef(profile.uid);
    }

    await push(budgetsRef, newBudget);
  }

  getBudgets(startDate?: Date, endDate?: Date): Observable<ServiceIBudget[]> {
    return this.authService.userProfile$.pipe(
      filter((profile): profile is UserProfile => profile !== null),
      take(1),
      switchMap(profile => {
        const baseRef = profile.groupId
          ? this.getGroupBudgetsRef(profile.groupId)
          : this.getBudgetsRef(profile.uid);

        return from(get(baseRef)).pipe(
          map(snapshot => {
            const budgetsData = snapshot.val();
            if (!budgetsData) {
              return [];
            }

            let allBudgets: ServiceIBudget[] = Object.keys(budgetsData).map(key => ({
              id: key,
              ...budgetsData[key]
            }));

            if (startDate && endDate) {
              const start = new Date(startDate.setHours(0, 0, 0, 0));
              const end = new Date(endDate.setHours(23, 59, 59, 999));

              allBudgets = allBudgets.filter(budget => {
                if (!budget.period) return false;

                const periodParts = budget.period.split('-').map(Number);
                const year = periodParts[0];
                const month = periodParts.length > 1 ? periodParts[1] - 1 : 0; // JS month is 0-indexed

                if (budget.type === 'yearly') {
                   const budgetStart = new Date(year, 0, 1);
                   const budgetEnd = new Date(year, 11, 31, 23, 59, 59, 999);
                   return budgetStart <= end && budgetEnd >= start;
                }
                
                if (budget.type === 'monthly' || budget.type === 'weekly') {
                  const budgetStart = new Date(year, month, 1);
                  const budgetEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
                  return budgetStart <= end && budgetEnd >= start;
                }

                return false;
              });
            }

            return allBudgets;
          }),
          catchError(error => {
            console.error('Error fetching budgets:', error);
            return of([]);
          })
        );
      })
    );
  }

  async updateBudget(
    budgetId: string,
    updatedData: Partial<Omit<ServiceIBudget, 'id' | 'userId' | 'groupId' | 'createdAt'>>
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!budgetId) {
      throw new Error('Budget ID is required for update.');
    }

    let budgetRef: DatabaseReference;
    if (profile.groupId) {
        budgetRef = ref(this.db, `group_data/${profile.groupId}/budgets/${budgetId}`);
    } else {
        budgetRef = ref(this.db, `users/${profile.uid}/budgets/${budgetId}`);
    }

    await update(budgetRef, { ...updatedData, editedDevice: navigator.userAgent });
  }

  async deleteBudget(id: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!id) {
      throw new Error('Budget ID is required for deletion.');
    }

    let budgetRef: DatabaseReference;
    if (profile.groupId) {
        budgetRef = ref(this.db, `group_data/${profile.groupId}/budgets/${id}`);
    } else {
        budgetRef = ref(this.db, `users/${profile.uid}/budgets/${id}`);
    }
    await remove(budgetRef);
  }
}
