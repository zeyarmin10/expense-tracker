import { Injectable, inject } from '@angular/core';
import { Observable, of, firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';
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

  getBudgets(): Observable<ServiceIBudget[]> {
    return this.authService.userProfile$.pipe(
      switchMap(profile => {
        if (profile?.groupId) {
          return listVal<ServiceIBudget>(this.getGroupBudgetsRef(profile.groupId), {
            keyField: 'id',
          });
        } else if (profile?.uid) {
          return listVal<ServiceIBudget>(this.getBudgetsRef(profile.uid), {
            keyField: 'id',
          });
        } else {
          return of([]);
        }
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
