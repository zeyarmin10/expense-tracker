import { Injectable, inject } from '@angular/core';
import { Database, ref, remove, set, update } from '@angular/fire/database';
import { BehaviorSubject, filter } from 'rxjs';
import { NetworkService } from './network.service';
import { OfflineOperation, OfflineStoreService } from './offline-store.service';

/** Replays durable local writes as soon as a connection returns. */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private db = inject(Database);
  private network = inject(NetworkService);
  private store = inject(OfflineStoreService);
  private started = false;
  private syncing = false;
  readonly pendingCount$ = new BehaviorSubject<number>(0);

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.refreshPendingCount();
    this.network.isOnline$.pipe(filter(Boolean)).subscribe(() => void this.sync());
    if (this.network.isOnline$.value) void this.sync();
  }

  async refreshPendingCount(): Promise<void> {
    this.pendingCount$.next((await this.store.pendingOperations()).length);
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
      case 'update': return update(target, operation.payload || {});
      case 'remove': return remove(target);
    }
  }
}
