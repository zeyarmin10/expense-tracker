import { Injectable, Injector, inject } from '@angular/core';
import {
  DatabaseReference,
  push as rtdbPush,
  remove as rtdbRemove,
  set as rtdbSet,
  update as rtdbUpdate,
} from '@angular/fire/database';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth';
import { NetworkService } from './network.service';
import { OfflineCollection, OfflineOperation, OfflineOperationKind, OfflineStoreService } from './offline-store.service';
import { getActiveGroupId } from './user-data';

/** How long an online write may wait for the server before it is queued instead. */
export const ONLINE_WRITE_TIMEOUT_MS = 12000;

const CACHED_COLLECTIONS = new Set<string>([
  'expenses', 'incomes', 'categories', 'budgets', 'vouchers', 'products', 'shopExpenses',
]);

export class WriteTimeoutError extends Error {
  constructor() {
    super('WRITE_TIMEOUT');
  }
}

/** Resolves with the promise, or rejects with WriteTimeoutError after `ms`. */
export function withWriteTimeout<T>(promise: Promise<T>, ms = ONLINE_WRITE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WriteTimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Online RTDB writes for the offline-capable collections.
 *
 * A Firebase SDK write only resolves once the server acknowledges it, so
 * when the backend is reachable for the connectivity probe but not for
 * writes (a partial outage), or drops mid-write, `await set()` would wait
 * forever while the data sits only in the SDK's memory (lost if the app is
 * closed). On the native app these wrappers give up waiting after a timeout,
 * switch the app to offline mode, and put the same write into the durable
 * offline queue (and local cache) so it survives a restart and syncs later.
 *
 * The SDK may still deliver its copy once the server recovers. Every queued
 * write therefore targets the exact same path with the same data (push keys
 * are generated up front), so whichever copy lands second is a no-op.
 *
 * On the web there is no offline queue: these behave exactly like the
 * plain Firebase functions.
 */
@Injectable({ providedIn: 'root' })
export class GuardedWriteService {
  private network = inject(NetworkService);
  private store = inject(OfflineStoreService);
  private injector = inject(Injector);

  set(target: DatabaseReference, value: unknown): Promise<void> {
    return this.guard('set', target, value as Record<string, unknown>, () => rtdbSet(target, value));
  }

  update(target: DatabaseReference, values: object): Promise<void> {
    return this.guard('update', target, values as Record<string, unknown>, () => rtdbUpdate(target, values));
  }

  remove(target: DatabaseReference): Promise<void> {
    return this.guard('remove', target, undefined, () => rtdbRemove(target));
  }

  /** Like RTDB push(parent, value), but the key is fixed before writing so a queued retry hits the same record. */
  async push(parent: DatabaseReference, value: unknown): Promise<DatabaseReference> {
    const child = rtdbPush(parent);
    await this.set(child, value);
    return child;
  }

  /**
   * For writes that aren't a single set/update/remove (e.g. a stock
   * transaction): runs `write`, and if the server doesn't answer in time,
   * switches to offline mode and runs `queue` to store it durably instead.
   * Returns true when the write was queued.
   */
  async run(write: () => Promise<unknown>, queue: () => Promise<void>): Promise<boolean> {
    const pending = write();
    if (!Capacitor.isNativePlatform()) {
      await pending;
      return false;
    }
    try {
      await withWriteTimeout(pending);
      return false;
    } catch (error) {
      if (!(error instanceof WriteTimeoutError)) throw error;
      // The SDK keeps the write and may still settle it later; nobody awaits it now.
      pending.catch(() => undefined);
      this.network.markServerUnavailable();
      await queue();
      return true;
    }
  }

  /** Adds an operation to the durable queue and mirrors it into the local cache. */
  async queueOperation(
    kind: OfflineOperationKind,
    path: string,
    payload?: Record<string, unknown>,
    operationId = this.store.createId('op'),
  ): Promise<void> {
    const profile = await this.currentProfile();
    const operation: OfflineOperation = {
      id: operationId,
      kind,
      path,
      payload,
      spaceName: profile?.currentSpaceName,
      createdAt: this.store.nextOperationTimestamp(),
      attempts: 0,
    };
    await this.store.enqueue(operation);
    await this.mirrorToCache(kind, path, payload, profile).catch(() => undefined);
  }

  createOperationId(): string {
    return this.store.createId('op');
  }

  pathOf(target: DatabaseReference): string {
    const rootUrl = target.root.toString().replace(/\/$/, '');
    return decodeURIComponent(target.toString().slice(rootUrl.length)).replace(/^\/+/, '');
  }

  private async guard(
    kind: OfflineOperationKind,
    target: DatabaseReference,
    payload: Record<string, unknown> | undefined,
    write: () => Promise<void>,
  ): Promise<void> {
    await this.run(write, () => this.queueOperation(kind, this.pathOf(target), payload));
  }

  private async currentProfile() {
    try {
      return await withWriteTimeout(firstValueFrom(this.injector.get(AuthService).userProfile$), 2000);
    } catch {
      return null;
    }
  }

  /** Keeps the offline view in step with the queued write (record-level paths only). */
  private async mirrorToCache(
    kind: OfflineOperationKind,
    path: string,
    payload: Record<string, unknown> | undefined,
    profile: Awaited<ReturnType<GuardedWriteService['currentProfile']>>,
  ): Promise<void> {
    if (!profile?.uid) return;
    const parts = path.split('/');
    if (parts.length !== 4 || !['users', 'space_data', 'group_data'].includes(parts[0])) return;
    const [, , collection, recordId] = parts;
    if (!CACHED_COLLECTIONS.has(collection)) return;
    const groupId = getActiveGroupId(profile);
    const scope = groupId ? `${profile.uid}:shared:${groupId}` : profile.uid;
    if (kind === 'remove') {
      await this.store.removeRecord(scope, collection as OfflineCollection, recordId);
    } else {
      await this.store.patchRecord(scope, collection as OfflineCollection, recordId, payload || {});
    }
  }
}
