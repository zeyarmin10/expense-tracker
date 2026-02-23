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
  id?: string; 
  date: string;
  amount: number;
  currency: string;
  description?: string;
  userId?: string; 
  groupId?: string;
  createdAt?: string; 
  device: string;
  editedDevice?: string;
}

@Injectable({
  providedIn: 'root',
})
export class IncomeService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);

  constructor() {
  }

  private getIncomesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/incomes`);
  }

  private getGroupIncomesRef(groupId: string): DatabaseReference {
    return ref(this.db, `group_data/${groupId}/incomes`);
  }

  async addIncome(
    incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'groupId' | 'createdAt' | 'device' | 'editedDevice'>
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
        throw new Error('User not authenticated.');
    }

    const newIncomeToSave: Omit<ServiceIIncome, 'id'> = {
      ...incomeData,
      userId: profile.uid,
      createdAt: new Date().toISOString(),
      device: navigator.userAgent,
    };

    let incomesRef: DatabaseReference;
    if (profile.groupId) {
        newIncomeToSave.groupId = profile.groupId;
        incomesRef = this.getGroupIncomesRef(profile.groupId);
    } else {
        incomesRef = this.getIncomesRef(profile.uid);
    }

    await push(incomesRef, newIncomeToSave);
  }

  getIncomes(): Observable<ServiceIIncome[]> {
    return this.authService.userProfile$.pipe(
      switchMap((profile) => {
        if (profile?.groupId) {
            return listVal<ServiceIIncome>(this.getGroupIncomesRef(profile.groupId), {
                keyField: 'id',
            });
        } else if (profile?.uid) {
          return listVal<ServiceIIncome>(this.getIncomesRef(profile.uid), {
            keyField: 'id',
          });
        }
        return of([]); 
      })
    );
  }

  async updateIncome(
    incomeId: string,
    updatedData: Partial<Omit<ServiceIIncome, 'id' | 'userId' | 'groupId' | 'createdAt'>>
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
        throw new Error('User not authenticated.');
    }

    if (!incomeId) {
      throw new Error('Income ID is required for update.');
    }

    let incomeRef: DatabaseReference;
    if (profile.groupId) {
        incomeRef = ref(this.db, `group_data/${profile.groupId}/incomes/${incomeId}`);
    } else {
        incomeRef = ref(this.db, `users/${profile.uid}/incomes/${incomeId}`);
    }

    await update(incomeRef, { ...updatedData, editedDevice: navigator.userAgent });
  }

  async deleteIncome(id: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) {
        throw new Error('User not authenticated.');
    }
    
    if (!id) {
      throw new Error('Income ID is required for deletion.');
    }

    let incomeRef: DatabaseReference;
    if (profile.groupId) {
        incomeRef = ref(this.db, `group_data/${profile.groupId}/incomes/${id}`);
    } else {
        incomeRef = ref(this.db, `users/${profile.uid}/incomes/${id}`);
    }
    await remove(incomeRef);
  }

  getIncomesByYear(year: number): Observable<ServiceIIncome[]> {
    return this.getIncomes().pipe(
      map((incomes) =>
        incomes.filter((income) => new Date(income.date).getFullYear() === year)
      )
    );
  }
}
