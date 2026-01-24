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

  async addIncome(
    incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt' | 'device' | 'editedDevice'>
  ): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }

    const newIncomeToSave: ServiceIIncome = {
      ...incomeData,
      userId,
      createdAt: new Date().toISOString(),
      device: navigator.userAgent,
    };
    await push(this.getIncomesRef(userId), newIncomeToSave);
  }

  getIncomes(): Observable<ServiceIIncome[]> {
    return this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user?.uid) {
          return listVal<ServiceIIncome>(this.getIncomesRef(user.uid), {
            keyField: 'id',
          });
        }
        return of([]); 
      })
    );
  }

  async updateIncome(
    incomeId: string,
    updatedData: Partial<Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt'>>
  ): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!incomeId) {
      throw new Error('Income ID is required for update.');
    }
    const incomeRef = ref(this.db, `users/${userId}/incomes/${incomeId}`);
    await update(incomeRef, { ...updatedData, editedDevice: navigator.userAgent });
  }

  async deleteIncome(id: string): Promise<void> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }
    if (!id) {
      throw new Error('Income ID is required for deletion.');
    }
    const incomeRef = ref(this.db, `users/${userId}/incomes/${id}`);
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
