import { Injectable, inject } from '@angular/core';
import { Database, get, ref } from '@angular/fire/database';
import { BehaviorSubject, combineLatest, filter } from 'rxjs';
import { AuthService } from './auth';
import { NetworkService } from './network.service';
import { PersonalOfflineDataService } from './personal-offline-data.service';
import { SharedOfflineDataService } from './shared-offline-data.service';
import { SpaceCollection, SpaceDataService } from './space-data.service';
import { getActiveGroupId, UserProfile } from './user-data';
import { OfflineStoreService } from './offline-store.service';
import { UserSpaceSummary } from './space.model';
import { GroupOfflineAccessService } from './group-offline-access.service';

/**
 * Hydrates only spaces listed in the signed-in user's own profile. It never
 * enumerates other users' spaces. Every record inside one of those owned or
 * shared spaces is copied, so historical reports stay correct offline.
 */
@Injectable({ providedIn: 'root' })
export class OfflineHydrationService {
  private auth = inject(AuthService);
  private db = inject(Database);
  private network = inject(NetworkService);
  private spaceData = inject(SpaceDataService);
  private personal = inject(PersonalOfflineDataService);
  private shared = inject(SharedOfflineDataService);
  private store = inject(OfflineStoreService);
  private groupOfflineAccess = inject(GroupOfflineAccessService);
  private started = false;
  private syncing = false;
  readonly lastSyncedAt$ = new BehaviorSubject<Date | null>(null);

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    combineLatest([this.auth.userProfile$, this.network.isOnline$]).pipe(
      filter(([profile, online]) => !!profile && online),
    ).subscribe(([profile]) => {
      if (profile) {
        void this.syncAllUserSpaces(profile).catch(error =>
          console.warn('[offline] Could not refresh every space cache.', error),
        );
      }
    });
  }

  async syncAllUserSpaces(profile?: UserProfile): Promise<void> {
    if (this.syncing || !this.network.isOnline$.value) return;
    if (!profile) return;
    const activeProfile = profile;
    this.syncing = true;
    try {
      await this.cacheSpaceSummaries(activeProfile);
      const personalProfile: UserProfile = {
        ...activeProfile,
        currentSpaceId: activeProfile.personalSpaceId || `personal:${activeProfile.uid}`,
        currentSpaceType: 'personal',
        groupId: null,
      };
      const groupProfiles = Object.keys(activeProfile.spaceMemberships || {})
        .filter(spaceId => spaceId !== activeProfile.personalSpaceId && !spaceId.startsWith('personal:'))
        .map(spaceId => ({
          ...activeProfile,
          currentSpaceId: spaceId,
          currentSpaceType: 'group' as const,
          groupId: spaceId,
        }));
      await Promise.all([personalProfile, ...groupProfiles].map(spaceProfile => this.syncSpace(spaceProfile)));
      this.lastSyncedAt$.next(new Date());
      this.network.markServerAvailable();
    } catch (error) {
      // A stale membership or permission error in one space does not mean
      // the backend is unreachable for all of the user's other spaces.
      if (!(await this.network.refreshInternetAccess())) {
        this.network.markServerUnavailable();
      }
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  // Compatibility entry point for pull-to-refresh and callers that already
  // have a profile; refreshing one account refreshes all its listed spaces.
  async syncActiveSpace(profile?: UserProfile): Promise<void> {
    await this.syncAllUserSpaces(profile);
  }

  private async syncSpace(profile: UserProfile): Promise<void> {
    await Promise.all([
        ...(['categories', 'budgets', 'products', 'expenses', 'incomes', 'vouchers', 'shopExpenses'] as SpaceCollection[])
          .map(collection => this.hydrateCollection(profile, collection)),
      ]);
    if (getActiveGroupId(profile)) {
      await this.groupOfflineAccess.markSuccessfulSync(profile);
    }
  }

  private async cacheSpaceSummaries(profile: UserProfile): Promise<void> {
    const personalId = profile.personalSpaceId || `personal:${profile.uid}`;
    const personal: UserSpaceSummary = {
      id: personalId,
      type: 'personal',
      name: 'My Personal',
      ownerId: profile.uid,
      currency: profile.currency || 'MMK',
      budgetPeriod: profile.budgetPeriod || null,
      budgetStartDate: profile.budgetStartDate || null,
      budgetEndDate: profile.budgetEndDate || null,
      selectedBudgetPeriodId: profile.selectedBudgetPeriodId || null,
      imageUrl: (profile as any).spaceImageUrl || profile.photoURL || null,
      createdAt: profile.createdAt || Date.now(),
      role: 'owner',
    };
    const groupSpaces = await Promise.all(
      Object.entries(profile.spaceMemberships || {})
        .filter(([spaceId]) => spaceId !== personalId && !spaceId.startsWith('personal:'))
        .map(async ([spaceId, role]) => {
          let raw: any = null;
          try {
            const canonical = await get(ref(this.db, `spaces/${spaceId}`));
            if (canonical.exists()) raw = canonical.val();
            else raw = (await get(ref(this.db, `groups/${spaceId}`))).val();
          } catch {
            // A stale membership must not stop all of this account's other
            // spaces from being prepared for offline use.
            return null;
          }
          if (!raw) return null;
          return {
            ...raw,
            id: spaceId,
            type: 'group',
            name: raw.name || raw.groupName || 'Group',
            role,
          } as UserSpaceSummary;
        }),
    );
    const records = Object.fromEntries(
      [personal, ...groupSpaces.filter((space): space is UserSpaceSummary => !!space)]
        .map(space => [space.id!, space]),
    ) as unknown as Record<string, Record<string, unknown>>;
    await this.store.replaceCollection(profile.uid, 'spaces', records);
  }

  private async hydrateCollection(
    profile: UserProfile,
    collection: SpaceCollection,
  ): Promise<void> {
    // Prefer the canonical /space_data path, but let SpaceDataService backfill
    // from legacy /group_data or /users data first. Otherwise a synced group
    // whose real data still lives in the legacy path is cached as an empty
    // space and then appears blank when the app starts offline.
    const { snapshot } = await this.spaceData.preferCanonicalSnapshot(profile, collection);
    const records = (snapshot.val() || {}) as Record<string, Record<string, unknown>>;
    if (getActiveGroupId(profile)) {
      await this.shared.cacheRemote(profile, collection, records);
    } else {
      await this.personal.cacheRemote(profile, collection, records);
    }
  }
}
