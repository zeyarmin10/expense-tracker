import { Injectable, inject } from '@angular/core';
import { Observable, of, firstValueFrom, from, combineLatest } from 'rxjs';
import { switchMap, map, catchError, filter } from 'rxjs/operators';
import {
  Database,
  ref,
  push,
  remove,
  update,
  DatabaseReference,
  get,
  objectVal,
} from '@angular/fire/database';
import { AuthService } from './auth';
import { getActiveGroupId, UserProfile } from './user-data';
import { SpaceDataService } from './space-data.service';
import { SpaceSwitchLoadingService } from './space-switch-loading.service';
import { PersonalOfflineDataService } from './personal-offline-data.service';
import { SharedOfflineDataService } from './shared-offline-data.service';
import { NetworkService } from './network.service';

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
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class BudgetService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);
  private spaceDataService = inject(SpaceDataService);
  private spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);
  private personalOfflineData = inject(PersonalOfflineDataService);
  private sharedOfflineData = inject(SharedOfflineDataService);
  private network = inject(NetworkService);

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

    if (this.sharedOfflineData.isOfflineShared(profile)) {
      await this.sharedOfflineData.write(
        profile, 'budgets', 'set', this.sharedOfflineData.createRecordId('budgets'),
        { ...newBudget, groupId: getActiveGroupId(profile) },
      );
      return;
    }

    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(
        profile, 'budgets', 'set', this.personalOfflineData.createRecordId('budgets'), newBudget,
      );
      return;
    }

    let budgetsRef: DatabaseReference;
    const activeGroupId = getActiveGroupId(profile);
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'budgets');
    if (activeGroupId) {
      newBudget.groupId = activeGroupId;
      budgetsRef = canonicalRef || legacyRef;
    } else {
      budgetsRef = canonicalRef || legacyRef;
    }

    await push(budgetsRef, newBudget);
  }

  getBudgets(
    startDate?: Date,
    endDate?: Date,
    profileOverride?: UserProfile,
  ): Observable<ServiceIBudget[]> {
    const profile$ = profileOverride
      ? of(profileOverride)
      : this.authService.userProfile$.pipe(
          filter((profile): profile is UserProfile => profile !== null),
        );

    return combineLatest([profile$, this.network.isOnline$]).pipe(
      switchMap(([profile]) => {
        if (this.sharedOfflineData.isOfflineShared(profile)) {
          return from(this.sharedOfflineData.read<ServiceIBudget>(profile, 'budgets')).pipe(
            map(budgets => this.filterBudgets(
              Object.entries(budgets).map(([id, budget]) => ({ id, ...budget })), startDate, endDate,
            )),
          );
        }
        if (this.personalOfflineData.isOfflinePersonal(profile)) {
          return from(this.personalOfflineData.read<ServiceIBudget>(profile, 'budgets')).pipe(
            map(budgetsData => this.filterBudgets(
              Object.entries(budgetsData).map(([id, budget]) => ({ id, ...budget })), startDate, endDate,
            )),
          );
        }
        return this.spaceSwitchLoadingService.track(
          from(this.spaceDataService.getActiveCollectionContext(profile, 'budgets')),
        ).pipe(
          switchMap(({ canonicalRef, legacyRef }) =>
            this.spaceSwitchLoadingService.track(objectVal<Record<string, Record<string, unknown>> | null>(canonicalRef || legacyRef)).pipe(
          map(budgetsData => {
            if (!budgetsData) {
              if (getActiveGroupId(profile)) {
                void this.sharedOfflineData.cacheRemote(profile, 'budgets', {});
              } else {
                void this.personalOfflineData.cacheRemote(profile, 'budgets', {});
              }
              return [];
            }

            if (getActiveGroupId(profile)) {
              void this.sharedOfflineData.cacheRemote(profile, 'budgets', budgetsData);
            } else {
              void this.personalOfflineData.cacheRemote(profile, 'budgets', budgetsData);
            }
            let allBudgets: ServiceIBudget[] = Object.keys(budgetsData).map(key => ({
              id: key,
              ...budgetsData[key] as unknown as ServiceIBudget
            }));

            return this.filterBudgets(allBudgets, startDate, endDate);
          }),
          catchError(error => {
            console.error('Error fetching budgets:', error);
            return of([]);
          })
            )
          )
        )
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

    if (this.sharedOfflineData.isOfflineShared(profile)) {
      const records = await this.sharedOfflineData.read<ServiceIBudget>(profile, 'budgets');
      const current = records[budgetId];
      if (!current) throw new Error('Budget not found on this device.');
      await this.sharedOfflineData.write(profile, 'budgets', 'update', budgetId, {
        ...updatedData, editedDevice: navigator.userAgent, updatedAt: new Date().toISOString(),
      }, current.updatedAt || current.createdAt || null);
      return;
    }

    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(profile, 'budgets', 'update', budgetId, {
        ...updatedData, editedDevice: navigator.userAgent,
      });
      return;
    }

    let budgetRef: DatabaseReference;
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'budgets');
    if (canonicalRef && currentSpaceId) {
        budgetRef = ref(this.db, `space_data/${currentSpaceId}/budgets/${budgetId}`);
    } else if (activeGroupId) {
        budgetRef = ref(this.db, `group_data/${activeGroupId}/budgets/${budgetId}`);
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

    if (this.sharedOfflineData.isOfflineShared(profile)) {
      const records = await this.sharedOfflineData.read<ServiceIBudget>(profile, 'budgets');
      await this.sharedOfflineData.write(profile, 'budgets', 'remove', id, undefined,
        records[id]?.updatedAt || records[id]?.createdAt || null);
      return;
    }

    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(profile, 'budgets', 'remove', id);
      return;
    }

    let budgetRef: DatabaseReference;
    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'budgets');
    if (canonicalRef && currentSpaceId) {
        budgetRef = ref(this.db, `space_data/${currentSpaceId}/budgets/${id}`);
    } else if (activeGroupId) {
        budgetRef = ref(this.db, `group_data/${activeGroupId}/budgets/${id}`);
    } else {
        budgetRef = ref(this.db, `users/${profile.uid}/budgets/${id}`);
    }
    await remove(budgetRef);
  }

  private filterBudgets(
    allBudgets: ServiceIBudget[], startDate?: Date, endDate?: Date,
  ): ServiceIBudget[] {
    if (!startDate || !endDate) return allBudgets;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return allBudgets.filter(budget => {
      if (!budget.period) return false;
      const periodParts = budget.period.split('-').map(Number);
      const year = periodParts[0];
      const month = periodParts.length > 1 ? periodParts[1] - 1 : 0;
      const budgetStart = budget.type === 'yearly' ? new Date(year, 0, 1) : new Date(year, month, 1);
      const budgetEnd = budget.type === 'yearly'
        ? new Date(year, 11, 31, 23, 59, 59, 999)
        : new Date(year, month + 1, 0, 23, 59, 59, 999);
      return budgetStart <= end && budgetEnd >= start;
    });
  }
}
