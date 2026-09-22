import { Injectable, inject } from '@angular/core';
import { getActiveGroupId, UserProfile } from './user-data';
import { NetworkService } from './network.service';
import { OfflineCollection, OfflineOperationKind, OfflineStoreService } from './offline-store.service';

/** Offline cache/queue for a group space. Unlike personal data, edits retain
 * the revision that was seen locally so OfflineSyncService can stop conflicts. */
@Injectable({ providedIn: 'root' })
export class SharedOfflineDataService {
  private network = inject(NetworkService);
  private store = inject(OfflineStoreService);

  isOfflineShared(profile: UserProfile | null | undefined): boolean {
    return !!getActiveGroupId(profile) && !this.network.isOnline$.value;
  }

  private groupId(profile: UserProfile): string {
    const groupId = getActiveGroupId(profile);
    if (!groupId) throw new Error('No shared space is active.');
    return groupId;
  }

  private scope(profile: UserProfile): string {
    return `${profile.uid}:shared:${this.groupId(profile)}`;
  }

  path(profile: UserProfile, collection: OfflineCollection, recordId?: string): string {
    const base = `space_data/${this.groupId(profile)}/${collection}`;
    return recordId ? `${base}/${recordId}` : base;
  }

  read<T extends object>(profile: UserProfile, collection: OfflineCollection): Promise<Record<string, T>> {
    return this.store.getCollection<T>(this.scope(profile), collection);
  }

  async cacheRemote(
    profile: UserProfile,
    collection: OfflineCollection,
    remoteRecords: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const records = { ...remoteRecords };
    const prefix = `${this.path(profile, collection)}/`;
    for (const operation of await this.store.pendingOperations()) {
      if (!operation.path.startsWith(prefix)) continue;
      const id = operation.path.slice(prefix.length).split('/')[0];
      if (operation.kind === 'remove') delete records[id];
      else if (operation.kind === 'set') records[id] = { ...(operation.payload || {}) };
      else records[id] = { ...(records[id] || {}), ...(operation.payload || {}) };
    }
    await this.store.replaceCollection(this.scope(profile), collection, records);
  }

  async write(
    profile: UserProfile,
    collection: OfflineCollection,
    kind: OfflineOperationKind,
    recordId: string,
    payload?: Record<string, unknown>,
    baseUpdatedAt?: string | null,
  ): Promise<void> {
    const scope = this.scope(profile);
    if (kind === 'remove') await this.store.removeRecord(scope, collection, recordId);
    else await this.store.patchRecord(scope, collection, recordId, payload || {});
    await this.store.enqueue({
      id: this.store.createId('op'), kind, path: this.path(profile, collection, recordId), payload,
      createdAt: this.store.nextOperationTimestamp(), sharedSpaceId: this.groupId(profile), baseUpdatedAt,
      attempts: 0,
    });
  }

  createRecordId(collection: OfflineCollection): string {
    return this.store.createId(`shared-${collection.slice(0, 3)}`);
  }
}
