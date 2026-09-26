import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject } from 'rxjs';
import { NetworkService } from './network.service';
import { OfflineStoreService } from './offline-store.service';
import { getActiveGroupId, UserProfile } from './user-data';

const DAY_MS = 24 * 60 * 60 * 1000;
const WARNING_DAYS = [3, 5] as const;
const LOCK_AFTER_DAYS = 7;

interface GroupOfflineMetadata {
  lastSuccessfulSyncAt: number;
  shownWarnings: number[];
}

export interface GroupOfflineAccessState {
  groupId: string;
  offlineDays: number;
  warningDay: 3 | 5 | null;
  shouldWarn: boolean;
  isLocked: boolean;
}

/**
 * Applies an offline lease only to shared spaces. A successful server
 * hydration renews the lease; personal spaces deliberately never use it.
 */
@Injectable({ providedIn: 'root' })
export class GroupOfflineAccessService {
  private network = inject(NetworkService);
  private store = inject(OfflineStoreService);
  readonly state$ = new BehaviorSubject<GroupOfflineAccessState | null>(null);

  private key(groupId: string): string {
    return `group-offline-access:${groupId}`;
  }

  async evaluate(profile: UserProfile | null | undefined): Promise<GroupOfflineAccessState | null> {
    if (!Capacitor.isNativePlatform()) {
      this.state$.next(null);
      return null;
    }
    const groupId = getActiveGroupId(profile);
    if (!groupId) {
      this.state$.next(null);
      return null;
    }

    return this.getState(groupId, true);
  }

  private async getState(groupId: string, publish: boolean): Promise<GroupOfflineAccessState> {

    let metadata = await this.store.getMetadata<GroupOfflineMetadata>(this.key(groupId));
    // Existing cached groups from before this feature get a fair seven-day
    // lease rather than being unexpectedly locked on their first update.
    if (!metadata) {
      metadata = { lastSuccessfulSyncAt: Date.now(), shownWarnings: [] };
      await this.store.setMetadata(this.key(groupId), metadata);
    }

    const offlineDays = Math.max(0, (Date.now() - metadata.lastSuccessfulSyncAt) / DAY_MS);
    const warningDay = WARNING_DAYS.slice().reverse().find(day => offlineDays >= day) ?? null;
    const isLocked = !this.network.isOnline$.value && offlineDays >= LOCK_AFTER_DAYS;
    const state: GroupOfflineAccessState = {
      groupId,
      offlineDays,
      warningDay,
      shouldWarn: !this.network.isOnline$.value && !isLocked && !!warningDay && !metadata.shownWarnings.includes(warningDay),
      isLocked,
    };
    if (publish) this.state$.next(state);
    return state;
  }

  async markWarningShown(state: GroupOfflineAccessState): Promise<void> {
    if (!state.warningDay) return;
    const key = this.key(state.groupId);
    const metadata = await this.store.getMetadata<GroupOfflineMetadata>(key);
    if (!metadata || metadata.shownWarnings.includes(state.warningDay)) return;
    await this.store.setMetadata(key, {
      ...metadata,
      shownWarnings: [...metadata.shownWarnings, state.warningDay],
    });
  }

  /** Called only after every collection of a shared space was read from RTDB. */
  async markSuccessfulSync(profile: UserProfile): Promise<void> {
    const groupId = getActiveGroupId(profile);
    if (!groupId) return;
    await this.store.setMetadata(this.key(groupId), {
      lastSuccessfulSyncAt: Date.now(),
      shownWarnings: [],
    } satisfies GroupOfflineMetadata);
    void this.evaluate(profile);
  }

  /** Final protection for queued shared writes in case an overlay is bypassed. */
  async assertCanWriteOffline(profile: UserProfile): Promise<void> {
    const groupId = getActiveGroupId(profile);
    if (!groupId) return;
    await this.assertCanOpenOfflineGroup(groupId);
  }

  /** Used before an offline space switch, without altering the active-space UI state. */
  async assertCanOpenOfflineGroup(groupId: string): Promise<void> {
    if (this.network.isOnline$.value) return;
    const state = await this.getState(groupId, false);
    if (state.isLocked) {
      throw new Error('GROUP_OFFLINE_ACCESS_EXPIRED: Connect to the internet to sync this shared space.');
    }
  }
}
