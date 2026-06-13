import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, of, firstValueFrom, from } from 'rxjs';
import { map, switchMap, catchError, filter } from 'rxjs/operators';
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
import { getActiveGroupId, UserDataService, UserProfile } from './user-data';
import { SpaceDataService } from './space-data.service';
import { SpaceSwitchLoadingService } from './space-switch-loading.service';

export interface ServiceIIncome {
  id?: string;
  date: string;
  amount: number;
  currency: string;
  description?: string;
  userId?: string;
  groupId?: string;
  createdAt?: string;
  createdByName?: string;
  createdByPhotoURL?: string | null;
  device: string;
  editedDevice?: string;
}

@Injectable({
  providedIn: 'root',
})
export class IncomeService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private spaceDataService = inject(SpaceDataService);
  private spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);

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
      createdByName: profile.displayName || 'Anonymous',
      createdByPhotoURL: profile.photoURL || null,
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

  getIncomes(
    startDate?: Date,
    endDate?: Date,
    profileOverride?: UserProfile,
  ): Observable<ServiceIIncome[]> {
    const profile$ = profileOverride
      ? of(profileOverride)
      : this.authService.userProfile$.pipe(
          filter((profile): profile is UserProfile => profile !== null),
        );

    return profile$.pipe(
      switchMap((profile) =>
        this.spaceSwitchLoadingService.track(
          from(this.spaceDataService.getActiveCollectionContext(profile, 'incomes')),
        ).pipe(
          switchMap(({ canonicalRef, legacyRef }) => {
            const baseRef = canonicalRef || legacyRef;
            let incomesQuery: Query = baseRef;

            if (startDate && endDate) {
              const start = startDate.toISOString().split('T')[0];
              const end = endDate.toISOString().split('T')[0];
              incomesQuery = query(baseRef, orderByChild('date'), startAt(start), endAt(end));
            }

            return this.spaceSwitchLoadingService.track(from(get(incomesQuery))).pipe(
          switchMap(async snapshot => {
            const incomesData = snapshot.val();
            if (!incomesData) {
              return [];
            }

            const missingNameIds = new Set<string>();
            Object.values(incomesData).forEach((income: any) => {
              if (income.userId && !income.createdByName) {
                missingNameIds.add(income.userId);
              }
            });

            const userProfiles: Record<string, UserProfile> = {};
            if (missingNameIds.size > 0) {
              const results = await Promise.all(
                [...missingNameIds].map(uid =>
                  firstValueFrom(this.userDataService.getUserProfile(uid))
                    .then(p => ({ uid, profile: p }))
                )
              );
              results.forEach(({ uid, profile }) => {
                if (profile) userProfiles[uid] = profile;
              });
            }

            return Object.keys(incomesData).map(key => {
              const income = incomesData[key] as ServiceIIncome;
              const createdByName = income.createdByName ||
                (income.userId ? userProfiles[income.userId]?.displayName : undefined);
              const createdByPhotoURL = income.createdByPhotoURL ??
                (income.userId ? userProfiles[income.userId]?.photoURL || null : null);
              return {
                id: key,
                ...income,
                createdByName: createdByName || 'Former Member',
                createdByPhotoURL,
              } as ServiceIIncome;
            });
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
