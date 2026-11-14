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
import { getActiveGroupId, PublicUserProfile, UserDataService, UserProfile } from './user-data';
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
  /** Creator's name/photo snapshot at creation (live profile preferred when shown). */
  createdByName?: string;
  createdByPhotoURL?: string | null;
  /** Last edit — who made it (uid) plus a name/photo snapshot for display. */
  updatedBy?: string;
  updatedByName?: string;
  updatedByPhotoURL?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class BudgetService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);
  private spaceDataService = inject(SpaceDataService);
  private userDataService = inject(UserDataService);
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
      // Snapshot so the creator still shows offline / after leaving the space.
      createdByName: profile.displayName || 'Anonymous',
      createdByPhotoURL: profile.photoURL || null,
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
          switchMap(async budgetsData => {
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

            return this.filterBudgets(await this.withPeople(allBudgets), startDate, endDate);
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

  /**
   * Member name/photo lookups (public mirror), shared across emissions with a
   * short TTL so a renamed member still updates. Misses aren't cached.
   */
  private readonly publicProfileCache = new Map<string, { at: number; profile: Promise<PublicUserProfile | null> }>();

  private getCachedPublicProfile(userId: string): Promise<PublicUserProfile | null> {
    const hit = this.publicProfileCache.get(userId);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.profile;
    const profile = firstValueFrom(this.userDataService.getPublicProfile(userId)).catch(() => null);
    this.publicProfileCache.set(userId, { at: Date.now(), profile });
    profile.then(found => {
      if (!found && this.publicProfileCache.get(userId)?.profile === profile) this.publicProfileCache.delete(userId);
    });
    return profile;
  }

  /** Creator / last editor names + photos: live profile first, then the stored snapshot. */
  private async withPeople(budgets: ServiceIBudget[]): Promise<ServiceIBudget[]> {
    const ids = new Set<string>();
    for (const b of budgets) {
      if (b.userId) ids.add(b.userId);
      if (b.updatedBy) ids.add(b.updatedBy);
    }
    const profiles = new Map<string, PublicUserProfile>();
    await Promise.all([...ids].map(async id => {
      const p = await this.getCachedPublicProfile(id);
      if (p) profiles.set(id, p);
    }));
    return budgets.map(b => {
      const creator = b.userId ? profiles.get(b.userId) : undefined;
      const editor = b.updatedBy ? profiles.get(b.updatedBy) : undefined;
      return {
        ...b,
        createdByName: creator?.displayName || b.createdByName,
        createdByPhotoURL: creator ? (creator.photoURL || null) : (b.createdByPhotoURL ?? null),
        updatedByName: editor?.displayName || b.updatedByName,
        updatedByPhotoURL: editor ? (editor.photoURL || null) : (b.updatedByPhotoURL ?? null),
      };
    });
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
    // Who/when of the last edit, shown on the budget card.
    const editMeta = {
      editedDevice: navigator.userAgent,
      updatedAt: new Date().toISOString(),
      updatedBy: profile.uid,
      updatedByName: profile.displayName || 'Anonymous',
      updatedByPhotoURL: profile.photoURL || null,
    };

    if (this.sharedOfflineData.isOfflineShared(profile)) {
      const records = await this.sharedOfflineData.read<ServiceIBudget>(profile, 'budgets');
      const current = records[budgetId];
      if (!current) throw new Error('Budget not found on this device.');
      await this.sharedOfflineData.write(profile, 'budgets', 'update', budgetId, {
        ...updatedData, ...editMeta,
      }, current.updatedAt || current.createdAt || null);
      return;
    }

    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(profile, 'budgets', 'update', budgetId, {
        ...updatedData, ...editMeta,
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

    await update(budgetRef, { ...updatedData, ...editMeta });
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
