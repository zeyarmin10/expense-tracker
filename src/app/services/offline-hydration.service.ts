import { Injectable, inject } from '@angular/core';
import { Database, get, orderByChild, query, startAt } from '@angular/fire/database';
import { BehaviorSubject, combineLatest, filter } from 'rxjs';
import { AuthService } from './auth';
import { NetworkService } from './network.service';
import { PersonalOfflineDataService } from './personal-offline-data.service';
import { SharedOfflineDataService } from './shared-offline-data.service';
import { SpaceCollection, SpaceDataService } from './space-data.service';
import { getActiveGroupId, UserProfile } from './user-data';

/**
 * Hydrates only the signed-in user's CURRENT space. It never enumerates other
 * spaces/users. Small lookup collections are complete; date-based records are
 * intentionally limited to the recent window needed for normal offline work.
 */
@Injectable({ providedIn: 'root' })
export class OfflineHydrationService {
  private db = inject(Database);
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
      if (profile) void this.syncActiveSpace(profile);
    });
  }

  async syncActiveSpace(profile?: UserProfile): Promise<void> {
    if (this.syncing || !this.network.isOnline$.value) return;
    if (!profile) return;
    const activeProfile = profile;
    this.syncing = true;
    try {
      await Promise.all([
        ...(['categories', 'budgets', 'products'] as SpaceCollection[]).map(collection =>
          this.hydrateCollection(activeProfile, collection, false)),
        ...(['expenses', 'incomes', 'vouchers', 'shopExpenses'] as SpaceCollection[]).map(collection =>
          this.hydrateCollection(activeProfile, collection, true)),
      ]);
      this.lastSyncedAt$.next(new Date());
    } finally {
      this.syncing = false;
    }
  }

  private async hydrateCollection(
    profile: UserProfile,
    collection: SpaceCollection,
    recentOnly: boolean,
  ): Promise<void> {
    // Do not call the migration helper here: it deliberately reads an entire
    // legacy collection to backfill it, which defeats this targeted sync.
    // Normal app flows can still migrate legacy data; hydration only reads
    // the selected space and (for transactions) the selected date window.
    const spaceId = this.spaceData.getCurrentSpaceId(profile);
    const source = spaceId && !spaceId.startsWith('personal:')
      ? this.spaceData.getCanonicalCollectionRef(spaceId, collection)
      : this.spaceData.getLegacyCollectionRef(profile, collection);
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const start = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
    const snapshot = await get(recentOnly ? query(source, orderByChild('date'), startAt(start)) : source);
    const records = (snapshot.val() || {}) as Record<string, Record<string, unknown>>;
    if (getActiveGroupId(profile)) {
      await this.shared.cacheRemote(profile, collection, records);
    } else {
      await this.personal.cacheRemote(profile, collection, records);
    }
  }
}
