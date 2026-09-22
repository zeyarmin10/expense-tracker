import { Injectable, inject } from '@angular/core';
import { get } from '@angular/fire/database';
import { BehaviorSubject, combineLatest, filter } from 'rxjs';
import { AuthService } from './auth';
import { NetworkService } from './network.service';
import { PersonalOfflineDataService } from './personal-offline-data.service';
import { SharedOfflineDataService } from './shared-offline-data.service';
import { SpaceCollection, SpaceDataService } from './space-data.service';
import { getActiveGroupId, UserProfile } from './user-data';

/**
 * Hydrates only spaces listed in the signed-in user's own profile. It never
 * enumerates other users' spaces. Every record inside one of those owned or
 * shared spaces is copied, so historical reports stay correct offline.
 */
@Injectable({ providedIn: 'root' })
export class OfflineHydrationService {
  private auth = inject(AuthService);
  private network = inject(NetworkService);
  private spaceData = inject(SpaceDataService);
  private personal = inject(PersonalOfflineDataService);
  private shared = inject(SharedOfflineDataService);
  private started = false;
  private syncing = false;
  readonly lastSyncedAt$ = new BehaviorSubject<Date | null>(null);

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    combineLatest([this.auth.userProfile$, this.network.isOnline$]).pipe(
      filter(([profile, online]) => !!profile && online),
    ).subscribe(([profile]) => {
      if (profile) void this.syncAllUserSpaces(profile);
    });
  }

  async syncAllUserSpaces(profile?: UserProfile): Promise<void> {
    if (this.syncing || !this.network.isOnline$.value) return;
    if (!profile) return;
    const activeProfile = profile;
    this.syncing = true;
    try {
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
  }

  private async hydrateCollection(
    profile: UserProfile,
    collection: SpaceCollection,
  ): Promise<void> {
    // Do not call the migration helper here: it deliberately reads an entire
    // legacy collection to backfill it, which defeats this targeted sync.
    // Normal app flows can still migrate legacy data; hydration only reads
    // the selected, user-owned/shared space.
    const spaceId = this.spaceData.getCurrentSpaceId(profile);
    const source = spaceId && !spaceId.startsWith('personal:')
      ? this.spaceData.getCanonicalCollectionRef(spaceId, collection)
      : this.spaceData.getLegacyCollectionRef(profile, collection);
    const snapshot = await get(source);
    const records = (snapshot.val() || {}) as Record<string, Record<string, unknown>>;
    if (getActiveGroupId(profile)) {
      await this.shared.cacheRemote(profile, collection, records);
    } else {
      await this.personal.cacheRemote(profile, collection, records);
    }
  }
}
