import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { getActiveGroupId, UserProfile } from './user-data';
import { NetworkService } from './network.service';
import { OfflineCollection, OfflineOperationKind, OfflineStoreService } from './offline-store.service';

/** Native offline cache and write queue for personal-space records. */
@Injectable({ providedIn: 'root' })
export class PersonalOfflineDataService {
  private network = inject(NetworkService);
  private store = inject(OfflineStoreService);

  isOfflinePersonal(profile: UserProfile | null | undefined): boolean {
    return Capacitor.isNativePlatform() &&
      !!profile?.uid && !getActiveGroupId(profile) && !this.network.isOnline$.value;
  }

  path(profile: UserProfile, collection: OfflineCollection, recordId?: string): string {
    const base = profile.personalSpaceId
      ? `space_data/${profile.personalSpaceId}/${collection}`
      : `users/${profile.uid}/${collection}`;
    return recordId ? `${base}/${recordId}` : base;
  }

  async read<T extends object>(
    profile: UserProfile,
    collection: OfflineCollection,
  ): Promise<Record<string, T>> {
    return this.store.getCollection<T>(profile.uid, collection);
  }

  async cacheRemote(
    profile: UserProfile,
    collection: OfflineCollection,
    remoteRecords: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    // Never let a just-fetched server snapshot visually undo a local write
    // that is still in the queue.
    const records = { ...remoteRecords };
    const prefix = `${this.path(profile, collection)}/`;
    for (const operation of await this.store.pendingOperations()) {
      if (!operation.path.startsWith(prefix)) continue;
      const recordId = operation.path.slice(prefix.length).split('/')[0];
      if (!recordId) continue;
      if (operation.kind === 'remove') {
        delete records[recordId];
      } else if (operation.kind === 'set') {
        records[recordId] = { ...(operation.payload || {}) };
      } else {
        records[recordId] = { ...(records[recordId] || {}), ...(operation.payload || {}) };
      }
    }
    await this.store.replaceCollection(profile.uid, collection, records);
  }

  async write(
    profile: UserProfile,
    collection: OfflineCollection,
    kind: OfflineOperationKind,
    recordId: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('WEB_REQUIRES_INTERNET');
    if (kind === 'remove') {
      await this.store.removeRecord(profile.uid, collection, recordId);
    } else if (kind === 'set') {
      await this.store.patchRecord(profile.uid, collection, recordId, payload || {});
    } else {
      await this.store.patchRecord(profile.uid, collection, recordId, payload || {});
    }
    await this.store.enqueue({
      id: this.store.createId('op'),
      kind,
      path: this.path(profile, collection, recordId),
      payload,
      createdAt: this.store.nextOperationTimestamp(),
      attempts: 0,
    });
  }

  /** Queue a nested audit write that has no top-level collection cache entry. */
  async queuePath(
    kind: OfflineOperationKind,
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('WEB_REQUIRES_INTERNET');
    await this.store.enqueue({
      id: this.store.createId('op'),
      kind,
      path,
      payload,
      createdAt: this.store.nextOperationTimestamp(),
      attempts: 0,
    });
  }

  async queueVoucherUpload(
    profile: UserProfile,
    voucherId: string,
    localVoucher: Record<string, unknown>,
    uploadPayload: Record<string, unknown>,
  ): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('WEB_REQUIRES_INTERNET');
    await this.store.patchRecord(profile.uid, 'vouchers', voucherId, localVoucher);
    await this.store.enqueue({
      id: this.store.createId('op'),
      kind: 'uploadVoucher',
      path: this.path(profile, 'vouchers', voucherId),
      payload: uploadPayload,
      createdAt: this.store.nextOperationTimestamp(),
      attempts: 0,
    });
  }

  createRecordId(collection: OfflineCollection): string {
    return this.store.createId(collection.slice(0, 3));
  }
}
