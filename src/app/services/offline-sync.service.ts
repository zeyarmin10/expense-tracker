import { Injectable, inject } from '@angular/core';
import { Database, get, ref, remove, set, update } from '@angular/fire/database';
import { BehaviorSubject, filter } from 'rxjs';
import { NetworkService } from './network.service';
import { OfflineOperation, OfflineStoreService } from './offline-store.service';
import { environment } from '../../environments/environment';

/** Replays durable local writes as soon as a connection returns. */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private db = inject(Database);
  private network = inject(NetworkService);
  private store = inject(OfflineStoreService);
  private started = false;
  private syncing = false;
  readonly pendingCount$ = new BehaviorSubject<number>(0);
  readonly conflictCount$ = new BehaviorSubject<number>(0);

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.refreshPendingCount();
    this.network.isOnline$.pipe(filter(Boolean)).subscribe(() => void this.sync());
    if (this.network.isOnline$.value) void this.sync();
  }

  async refreshPendingCount(): Promise<void> {
    const operations = await this.store.pendingOperations();
    this.pendingCount$.next(operations.length);
    this.conflictCount$.next(operations.filter(operation =>
      operation.lastError?.startsWith('SYNC_CONFLICT:'),
    ).length);
  }

  async sync(): Promise<void> {
    if (this.syncing || !this.network.isOnline$.value) return;
    this.syncing = true;
    try {
      for (const operation of await this.store.pendingOperations()) {
        if (!this.network.isOnline$.value) break;
        try {
          await this.apply(operation);
          await this.store.removeOperation(operation.id);
        } catch (error) {
          await this.store.markFailed(operation, error);
          // Preserve write order: an update after a failed create cannot run yet.
          break;
        }
      }
    } finally {
      this.syncing = false;
      await this.refreshPendingCount();
    }
  }

  private apply(operation: OfflineOperation): Promise<void> {
    const target = ref(this.db, operation.path);
    switch (operation.kind) {
      case 'set': return set(target, operation.payload || {});
      case 'update': return this.applySharedUpdate(operation, target);
      case 'remove': return this.applySharedRemove(operation, target);
      case 'uploadVoucher': return this.uploadVoucher(operation, target);
    }
  }

  private async assertNoSharedConflict(operation: OfflineOperation, target: ReturnType<typeof ref>): Promise<void> {
    if (!operation.sharedSpaceId || !operation.baseUpdatedAt) return;
    const current = await get(target);
    const serverRevision = (current.val()?.updatedAt || current.val()?.createdAt) as string | undefined;
    if (serverRevision && serverRevision !== operation.baseUpdatedAt) {
      throw new Error('SYNC_CONFLICT: This shared record changed on another device.');
    }
  }

  private async applySharedUpdate(operation: OfflineOperation, target: ReturnType<typeof ref>): Promise<void> {
    await this.assertNoSharedConflict(operation, target);
    await update(target, operation.payload || {});
  }

  private async applySharedRemove(operation: OfflineOperation, target: ReturnType<typeof ref>): Promise<void> {
    await this.assertNoSharedConflict(operation, target);
    await remove(target);
  }

  private async uploadVoucher(operation: OfflineOperation, target: ReturnType<typeof ref>): Promise<void> {
    const payload = operation.payload as {
      voucherId?: string;
      userId?: string;
      fileKeys?: string[];
      cloudinaryFolder?: string;
      voucher?: Record<string, unknown>;
    } | undefined;
    if (!payload?.voucherId || !payload.userId || !payload.fileKeys?.length || !payload.voucher) {
      throw new Error('Invalid offline voucher upload operation.');
    }

    const uploads = await Promise.all(payload.fileKeys.map(async (key) => {
      const blob = await this.store.getBlob(key);
      if (!blob) throw new Error('Voucher image is no longer available on this device.');
      const body = new FormData();
      body.append('file', blob, 'voucher.jpg');
      body.append('upload_preset', environment.cloudinary.uploadPreset);
      body.append('folder', payload.cloudinaryFolder || `vouchers/users/${payload.userId}`);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${environment.cloudinary.cloudName}/image/upload`,
        { method: 'POST', body },
      );
      if (!response.ok) throw new Error(`Voucher upload failed (${response.status}).`);
      return response.json() as Promise<{ secure_url: string; public_id: string }>;
    }));

    const imageUrls = uploads.map(upload => upload.secure_url);
    const storagePaths = uploads.map(upload => upload.public_id);
    const voucher = {
      ...payload.voucher,
      imageUrl: imageUrls[0],
      imageUrls,
      imageCount: imageUrls.length,
      storagePath: storagePaths[0],
      storagePaths,
    };
    await set(target, voucher);
    await this.store.patchRecord(payload.userId, 'vouchers', payload.voucherId, {
      ...voucher,
      offlineFileKeys: undefined,
      syncStatus: 'synced',
    });
    await Promise.all(payload.fileKeys.map(key => this.store.removeBlob(key)));
  }
}
