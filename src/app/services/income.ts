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
import { getActiveGroupId, UserProfile } from './user-data';
import { SpaceDataService } from './space-data.service';

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
  private spaceDataService = inject(SpaceDataService);

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
    const activeGroupId = getActiveGroupId(profile);
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'incomes');
    if (activeGroupId) {
        newIncomeToSave.groupId = activeGroupId;
        incomesRef = canonicalRef || legacyRef;
    } else {
        incomesRef = canonicalRef || legacyRef;
    }

    await push(incomesRef, newIncomeToSave);
  }

  getIncomes(startDate?: Date, endDate?: Date): Observable<ServiceIIncome[]> {
    return this.authService.userProfile$.pipe(
      filter((profile): profile is UserProfile => profile !== null),
      take(1),
      switchMap((profile) =>
        from(this.spaceDataService.getActiveCollectionContext(profile, 'incomes')).pipe(
          switchMap(({ canonicalRef, legacyRef }) => {
            const baseRef = canonicalRef || legacyRef;
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
        )
      )
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
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'incomes');
    if (canonicalRef && currentSpaceId) {
        incomeRef = ref(this.db, `space_data/${currentSpaceId}/incomes/${incomeId}`);
    } else if (activeGroupId) {
        incomeRef = ref(this.db, `group_data/${activeGroupId}/incomes/${incomeId}`);
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
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'incomes');
    if (canonicalRef && currentSpaceId) {
        incomeRef = ref(this.db, `space_data/${currentSpaceId}/incomes/${id}`);
    } else if (activeGroupId) {
        incomeRef = ref(this.db, `group_data/${activeGroupId}/incomes/${id}`);
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
