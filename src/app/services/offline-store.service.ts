import { Injectable } from '@angular/core';

/** Collections that Phase 1 can safely edit without a connection. */
export type OfflineCollection =
  | 'expenses' | 'incomes' | 'categories' | 'budgets' | 'vouchers' | 'products' | 'shopExpenses';
export type OfflineOperationKind = 'set' | 'update' | 'remove' | 'uploadVoucher';

export interface OfflineOperation {
  id: string;
  kind: OfflineOperationKind;
  /** Firebase path, deliberately stored without a leading slash. */
  path: string;
  payload?: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Present for shared-space edits, which must never silently overwrite a collaborator. */
  sharedSpaceId?: string;
  /** Server revision observed before the local edit; used for conflict detection. */
  baseUpdatedAt?: string | null;
}

interface StoredCollection {
  key: string;
  records: Record<string, Record<string, unknown>>;
}

interface StoredBlob {
  key: string;
  blob: Blob;
}

/**
 * Small IndexedDB wrapper used by the offline-first data layer.
 *
 * It intentionally has no third-party dependency: it works in Capacitor's
 * WebView and in a browser PWA, and falls back to memory in environments
 * (notably unit tests) where IndexedDB is unavailable. Firebase RTDB's web
 * cache is not durable across an app restart, so it is not sufficient here.
 */
@Injectable({ providedIn: 'root' })
export class OfflineStoreService {
  private readonly databaseName = 'kyat-wise-offline';
  private readonly databaseVersion = 2;
  private readonly collectionStore = 'collections';
  private readonly queueStore = 'queue';
  private readonly blobStore = 'blobs';
  private dbPromise?: Promise<IDBDatabase | null>;
  private readonly memoryCollections = new Map<string, StoredCollection>();
  private readonly memoryQueue = new Map<string, OfflineOperation>();
  private readonly memoryBlobs = new Map<string, Blob>();
  private lastOperationTimestamp = 0;

  private get database(): Promise<IDBDatabase | null> {
    if (!this.dbPromise) {
      this.dbPromise = this.openDatabase();
    }
    return this.dbPromise;
  }

  private openDatabase(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);

    return new Promise(resolve => {
      const request = indexedDB.open(this.databaseName, this.databaseVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.collectionStore)) {
          db.createObjectStore(this.collectionStore, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(this.queueStore)) {
          db.createObjectStore(this.queueStore, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.blobStore)) {
          db.createObjectStore(this.blobStore, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        // A private-browsing/device-storage restriction must not stop the app.
        console.warn('[offline] IndexedDB unavailable; using an in-memory cache.', request.error);
        resolve(null);
      };
    });
  }

  private collectionKey(userId: string, collection: OfflineCollection): string {
    return `${userId}:${collection}`;
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async getCollection<T extends object>(
    userId: string,
    collection: OfflineCollection,
  ): Promise<Record<string, T>> {
    const key = this.collectionKey(userId, collection);
    const db = await this.database;
    if (!db) return (this.memoryCollections.get(key)?.records || {}) as Record<string, T>;

    const transaction = db.transaction(this.collectionStore, 'readonly');
    const value = await this.request(transaction.objectStore(this.collectionStore).get(key));
    return ((value as StoredCollection | undefined)?.records || {}) as Record<string, T>;
  }

  async replaceCollection(
    userId: string,
    collection: OfflineCollection,
    records: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const key = this.collectionKey(userId, collection);
    const value: StoredCollection = { key, records };
    const db = await this.database;
    if (!db) {
      this.memoryCollections.set(key, value);
      return;
    }
    const transaction = db.transaction(this.collectionStore, 'readwrite');
    transaction.objectStore(this.collectionStore).put(value);
    await this.transactionDone(transaction);
  }

  async patchRecord(
    userId: string,
    collection: OfflineCollection,
    recordId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const records = await this.getCollection(userId, collection);
    records[recordId] = { ...(records[recordId] || {}), ...patch };
    await this.replaceCollection(userId, collection, records as Record<string, Record<string, unknown>>);
  }

  async removeRecord(userId: string, collection: OfflineCollection, recordId: string): Promise<void> {
    const records = await this.getCollection(userId, collection);
    delete records[recordId];
    await this.replaceCollection(userId, collection, records as Record<string, Record<string, unknown>>);
  }

  async getProfile<T extends object>(userId: string): Promise<T | null> {
    const profiles = await this.getCollection<T>(userId, 'profiles' as OfflineCollection);
    return profiles['profile'] || null;
  }

  async cacheProfile<T extends object>(userId: string, profile: T): Promise<void> {
    await this.replaceCollection(userId, 'profiles' as OfflineCollection, {
      profile: profile as Record<string, unknown>,
    });
  }

  async enqueue(operation: OfflineOperation): Promise<void> {
    const db = await this.database;
    if (!db) {
      this.memoryQueue.set(operation.id, operation);
      return;
    }
    const transaction = db.transaction(this.queueStore, 'readwrite');
    transaction.objectStore(this.queueStore).put(operation);
    await this.transactionDone(transaction);
  }

  async pendingOperations(): Promise<OfflineOperation[]> {
    const db = await this.database;
    if (!db) return [...this.memoryQueue.values()].sort((a, b) => a.createdAt - b.createdAt);
    const transaction = db.transaction(this.queueStore, 'readonly');
    const operations = await this.request(transaction.objectStore(this.queueStore).getAll());
    return (operations as OfflineOperation[]).sort((a, b) => a.createdAt - b.createdAt);
  }

  async removeOperation(id: string): Promise<void> {
    const db = await this.database;
    if (!db) {
      this.memoryQueue.delete(id);
      return;
    }
    const transaction = db.transaction(this.queueStore, 'readwrite');
    transaction.objectStore(this.queueStore).delete(id);
    await this.transactionDone(transaction);
  }

  async markFailed(operation: OfflineOperation, error: unknown): Promise<void> {
    await this.enqueue({
      ...operation,
      attempts: operation.attempts + 1,
      lastError: error instanceof Error ? error.message : String(error),
    });
  }

  async saveBlob(key: string, blob: Blob): Promise<void> {
    const db = await this.database;
    if (!db) {
      this.memoryBlobs.set(key, blob);
      return;
    }
    const transaction = db.transaction(this.blobStore, 'readwrite');
    transaction.objectStore(this.blobStore).put({ key, blob } as StoredBlob);
    await this.transactionDone(transaction);
  }

  async getBlob(key: string): Promise<Blob | null> {
    const db = await this.database;
    if (!db) return this.memoryBlobs.get(key) || null;
    const transaction = db.transaction(this.blobStore, 'readonly');
    const value = await this.request(transaction.objectStore(this.blobStore).get(key));
    return (value as StoredBlob | undefined)?.blob || null;
  }

  async removeBlob(key: string): Promise<void> {
    const db = await this.database;
    if (!db) {
      this.memoryBlobs.delete(key);
      return;
    }
    const transaction = db.transaction(this.blobStore, 'readwrite');
    transaction.objectStore(this.blobStore).delete(key);
    await this.transactionDone(transaction);
  }

  createId(prefix = 'offline'): string {
    const random = globalThis.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    // Firebase keys cannot include ., #, $, [, ], or /. UUIDs are safe.
    return `${prefix}_${random}`;
  }

  nextOperationTimestamp(): number {
    this.lastOperationTimestamp = Math.max(Date.now(), this.lastOperationTimestamp + 1);
    return this.lastOperationTimestamp;
  }
}
