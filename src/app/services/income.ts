import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, of, firstValueFrom, from } from 'rxjs';
import { map, switchMap, catchError, filter, take } from 'rxjs/operators';
import {
  Database,
  ref,
  push,
  remove,
  update,
  listVal,
  DatabaseReference,
  query,
  orderByChild,
  startAt,
  endAt,
  Query,
  get,
} from '@angular/fire/database';
import { AuthService } from './auth';
import { UserProfile } from './user-data';

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

  getIncomes(startDate?: Date, endDate?: Date): Observable<ServiceIIncome[]> {
    return this.authService.userProfile$.pipe(
      filter((profile): profile is UserProfile => profile !== null),
      take(1),
      switchMap((profile) => {
        const baseRef = profile.groupId
          ? this.getGroupIncomesRef(profile.groupId)
          : this.getIncomesRef(profile.uid);

        let incomesQuery: Query = baseRef;

        if (startDate && endDate) {
          const start = startDate.toISOString().split('T')[0];
          const end = endDate.toISOString().split('T')[0];
          incomesQuery = query(baseRef, orderByChild('date'), startAt(start), endAt(end));
        }

        return from(get(incomesQuery)).pipe(
          map(snapshot => {
            const incomesData = snapshot.val();
            if (!incomesData) {
              return [];
            }
            return Object.keys(incomesData).map(key => ({
              id: key,
              ...incomesData[key]
            }));
          }),
          catchError(error => {
            console.error('Error fetching incomes:', error);
            return of([]);
          })
        );
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
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    return this.getIncomes(startDate, endDate);
  }
}
