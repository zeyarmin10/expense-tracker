import { Injectable, inject } from '@angular/core';
import {
  Database,
  DatabaseReference,
  child,
  get,
  limitToFirst,
  query,
  ref,
  update,
} from '@angular/fire/database';
import { Auth } from '@angular/fire/auth';
import { getActiveGroupId, UserProfile } from './user-data';
import { environment } from '../../environments/environment';

export type SpaceCollection = 'expenses' | 'incomes' | 'budgets' | 'categories' | 'vouchers' | 'products' | 'shopExpenses';

export interface ActiveSpaceDataContext {
  spaceId: string | null;
  canonicalRef: DatabaseReference | null;
  legacyRef: DatabaseReference;
  source: 'canonical' | 'legacy';
}

@Injectable({
  providedIn: 'root',
})
export class SpaceDataService {
  private db = inject(Database);
  private auth = inject(Auth);
  private readonly ensuredSpaces = new Set<string>();
  private readonly ensuringSpaces = new Map<string, Promise<void>>();
  private readonly ensuredCollections = new Set<string>();
  private readonly ensuringCollections = new Map<string, Promise<void>>();
  private readonly virtualPersonalPrefix = 'personal:';

  private isPermissionDenied(error: any): boolean {
    // The SDK reports denials in several shapes: listener cancellations
    // carry code 'PERMISSION_DENIED' / message 'permission_denied at ...',
    // while a one-shot get() throws a plain Error('Permission denied') with
    // no code at all — match all of them.
    return (
      String(error?.code || '').toUpperCase() === 'PERMISSION_DENIED' ||
      /^permission[ _]denied/i.test(String(error?.message || ''))
    );
  }

  private isVirtualPersonalSpaceId(spaceId: string | null | undefined): boolean {
    return !!spaceId && spaceId.startsWith(this.virtualPersonalPrefix);
  }

  getCurrentSpaceId(profile: UserProfile): string | null {
    if (profile.currentSpaceType === 'group') {
      return profile.currentSpaceId || profile.groupId || null;
    }

    return profile.personalSpaceId || profile.currentSpaceId || null;
  }

  getLegacyCollectionRef(profile: UserProfile, collection: SpaceCollection): DatabaseReference {
    const activeGroupId = getActiveGroupId(profile);
    if (activeGroupId) {
      return ref(this.db, `group_data/${activeGroupId}/${collection}`);
    }

    return ref(this.db, `users/${profile.uid}/${collection}`);
  }

  getCanonicalCollectionRef(spaceId: string, collection: SpaceCollection): DatabaseReference {
    return ref(this.db, `space_data/${spaceId}/${collection}`);
  }

  /**
   * Keys only (RTDB REST `shallow=true`): ~25 bytes per record instead of the
   * whole record. Returns `'denied'` on a rules denial; throws on anything
   * else (offline, REST unreachable) so callers can fall back to the SDK.
   */
  private async shallowKeys(dbRef: DatabaseReference): Promise<string[] | 'denied'> {
    const token = await this.auth.currentUser?.getIdToken();
    if (!token) throw new Error('No auth token for shallow read');
    const base = new URL(environment.firebaseConfig.databaseURL);
    const url = new URL(`${base.origin}${new URL(dbRef.toString()).pathname}.json`);
    const ns = base.searchParams.get('ns'); // emulator namespace
    if (ns) url.searchParams.set('ns', ns);
    url.searchParams.set('shallow', 'true');
    url.searchParams.set('auth', token);
    const response = await fetch(url.toString());
    if (response.status === 401 || response.status === 403) return 'denied';
    if (!response.ok) throw new Error(`Shallow read failed: ${response.status}`);
    const body = await response.json();
    return body && typeof body === 'object' ? Object.keys(body) : [];
  }

  /**
   * Per-device "nothing left to migrate" flag. After a check finds every
   * legacy record already in space_data, the key comparison is skipped for
   * MIGRATION_RECHECK_MS. It still re-runs periodically, because members on
   * older app versions may keep writing to the legacy path.
   */
  private static readonly MIGRATION_RECHECK_MS = 24 * 60 * 60 * 1000;

  private migrationFlagKey(profile: UserProfile, spaceId: string, collection: SpaceCollection): string {
    return `kw_migrated:${profile.uid}:${spaceId}:${collection}`;
  }

  private isMigrationRecentlyVerified(key: string): boolean {
    try {
      const at = Number(localStorage.getItem(key));
      return Number.isFinite(at) && at > 0 && Date.now() - at < SpaceDataService.MIGRATION_RECHECK_MS;
    } catch {
      return false;
    }
  }

  private markMigrationVerified(key: string): void {
    try {
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // Storage unavailable (private mode): just re-check next launch.
    }
  }

  private async backfillCollection(spaceId: string, collection: SpaceCollection, profile: UserProfile): Promise<void> {
    const flagKey = this.migrationFlagKey(profile, spaceId, collection);
    if (this.isMigrationRecentlyVerified(flagKey)) {
      // Still probe canonical access: callers rely on this throwing when
      // space_data is denied (one row, so it's cheap).
      await get(query(this.getCanonicalCollectionRef(spaceId, collection), limitToFirst(1)));
      return;
    }
    await this.runBackfill(spaceId, collection, profile);
    this.markMigrationVerified(flagKey);
  }

  private async runBackfill(spaceId: string, collection: SpaceCollection, profile: UserProfile): Promise<void> {
    const legacyRef = this.getLegacyCollectionRef(profile, collection);
    const canonicalRef = this.getCanonicalCollectionRef(spaceId, collection);

    // A denied legacy read just means "no legacy data to backfill from" (the
    // normal case for any space that was always canonical-only) — it must
    // not be treated the same as a denied CANONICAL read, which is the only
    // one that should actually block using space_data.
    //
    // This runs for every collection on every launch, so it compares KEYS
    // first and only downloads legacy records missing from space_data
    // (normally none). Old accounts whose legacy copy was never deleted used
    // to re-download both full copies each time.
    const [legacyKeys] = await Promise.all([
      this.shallowKeys(legacyRef).catch(() => null),
      // Permission probe for the canonical path (throws if denied).
      get(query(canonicalRef, limitToFirst(1))),
    ]);

    if (legacyKeys === 'denied') return;
    if (legacyKeys === null) {
      // REST unavailable — previous full-snapshot comparison.
      await this.backfillFromSnapshots(spaceId, collection, legacyRef, canonicalRef);
      return;
    }
    if (legacyKeys.length === 0) return;

    const canonicalKeys = await this.shallowKeys(canonicalRef).catch(() => null);
    if (canonicalKeys === null || canonicalKeys === 'denied') {
      await this.backfillFromSnapshots(spaceId, collection, legacyRef, canonicalRef);
      return;
    }

    const existing = new Set(canonicalKeys);
    const missing = legacyKeys.filter(key => !existing.has(key));
    if (missing.length === 0) return;

    const updates: Record<string, unknown> = {};
    const BATCH = 25;
    for (let i = 0; i < missing.length; i += BATCH) {
      const snapshots = await Promise.all(missing.slice(i, i + BATCH).map(key => get(child(legacyRef, key))));
      for (const snapshot of snapshots) {
        if (snapshot.exists() && snapshot.key) {
          updates[`/space_data/${spaceId}/${collection}/${snapshot.key}`] = snapshot.val();
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await update(ref(this.db), updates);
    }
  }

  /** Full-download comparison; only used when the shallow REST read fails. */
  private async backfillFromSnapshots(
    spaceId: string,
    collection: SpaceCollection,
    legacyRef: DatabaseReference,
    canonicalRef: DatabaseReference,
  ): Promise<void> {
    const legacySnapshot = await get(legacyRef).catch((error: any) => {
      if (this.isPermissionDenied(error)) return null;
      throw error;
    });
    if (!legacySnapshot || !legacySnapshot.exists()) return;

    const canonicalSnapshot = await get(canonicalRef);
    const legacyData = legacySnapshot.val() || {};
    const canonicalData = canonicalSnapshot.exists() ? canonicalSnapshot.val() || {} : {};
    const updates: Record<string, unknown> = {};

    for (const [recordId, recordValue] of Object.entries(legacyData)) {
      if (!(recordId in canonicalData)) {
        updates[`/space_data/${spaceId}/${collection}/${recordId}`] = recordValue;
      }
    }

    if (Object.keys(updates).length > 0) {
      await update(ref(this.db), updates);
    }
  }

  private async ensureSpecificSpaceData(
    spaceId: string | null | undefined,
    profile: UserProfile,
    mode: 'personal' | 'group',
  ): Promise<void> {
    if (!spaceId || this.isVirtualPersonalSpaceId(spaceId) || this.ensuredSpaces.has(spaceId)) {
      return;
    }

    const migrationProfile: UserProfile = {
      ...profile,
      currentSpaceId: spaceId,
      currentSpaceType: mode,
      groupId: mode === 'group' ? spaceId : null,
    };

    try {
      await this.backfillCollection(spaceId, 'categories', migrationProfile);
      await this.backfillCollection(spaceId, 'budgets', migrationProfile);
      await this.backfillCollection(spaceId, 'incomes', migrationProfile);
      await this.backfillCollection(spaceId, 'expenses', migrationProfile);
      await this.backfillCollection(spaceId, 'vouchers', migrationProfile);
      await this.backfillCollection(spaceId, 'products', migrationProfile);
      await this.backfillCollection(spaceId, 'shopExpenses', migrationProfile);
      this.ensuredSpaces.add(spaceId);
    } catch (error: any) {
      if (!this.isPermissionDenied(error)) {
        throw error;
      }
      // Silently falling back to the (likely empty) legacy path here would
      // otherwise look exactly like "no data" with no error anywhere —
      // surface it so a space/user with a real membership mismatch is
      // diagnosable instead of silently showing empty.
      console.warn(
        `[SpaceDataService] Canonical space_data read denied for space ${spaceId} — ` +
        `falling back to legacy path, which is likely empty. This usually means ` +
        `/space_members/${spaceId}/{uid} is missing despite the user's own ` +
        `spaceMemberships entry claiming access.`,
      );
    }
  }

  private async ensureSpecificCollectionData(
    spaceId: string | null | undefined,
    collection: SpaceCollection,
    profile: UserProfile,
    mode: 'personal' | 'group',
  ): Promise<boolean> {
    if (!spaceId || this.isVirtualPersonalSpaceId(spaceId) || this.ensuredSpaces.has(spaceId)) {
      return !!spaceId && !this.isVirtualPersonalSpaceId(spaceId);
    }

    const fullSpacePromise = this.ensuringSpaces.get(spaceId);
    if (fullSpacePromise) {
      await fullSpacePromise;
      if (this.ensuredSpaces.has(spaceId)) {
        return true;
      }
    }

    const cacheKey = `${spaceId}:${collection}`;
    if (this.ensuredCollections.has(cacheKey)) {
      return true;
    }

    const existingPromise = this.ensuringCollections.get(cacheKey);
    if (existingPromise) {
      await existingPromise;
      return this.ensuredCollections.has(cacheKey);
    }

    const migrationProfile: UserProfile = {
      ...profile,
      currentSpaceId: spaceId,
      currentSpaceType: mode,
      groupId: mode === 'group' ? spaceId : null,
    };

    const ensurePromise = this.backfillCollection(spaceId, collection, migrationProfile)
      .then(() => {
        this.ensuredCollections.add(cacheKey);
      })
      .catch((error: any) => {
        if (!this.isPermissionDenied(error)) {
          throw error;
        }
        // See the matching warning in ensureSpecificSpaceData — this is the
        // per-collection variant actually used by getActiveCollectionContext.
        console.warn(
          `[SpaceDataService] Canonical space_data/${collection} read denied for space ${spaceId} — ` +
          `falling back to legacy path, which is likely empty. This usually means ` +
          `/space_members/${spaceId}/{uid} is missing despite the user's own ` +
          `spaceMemberships entry claiming access.`,
        );
      })
      .finally(() => {
        this.ensuringCollections.delete(cacheKey);
      });

    this.ensuringCollections.set(cacheKey, ensurePromise);
    await ensurePromise;
    return this.ensuredCollections.has(cacheKey);
  }

  async ensureActiveSpaceData(profile: UserProfile): Promise<string | null> {
    const spaceId = this.getCurrentSpaceId(profile);
    if (!spaceId || this.isVirtualPersonalSpaceId(spaceId) || this.ensuredSpaces.has(spaceId)) {
      return spaceId;
    }

    const existingPromise = this.ensuringSpaces.get(spaceId);
    if (existingPromise) {
      await existingPromise;
      return this.ensuredSpaces.has(spaceId) ? spaceId : null;
    }

    const ensurePromise = this.ensureSpecificSpaceData(
        spaceId,
        profile,
        getActiveGroupId(profile) ? 'group' : 'personal',
      )
      .finally(() => {
        this.ensuringSpaces.delete(spaceId);
      });

    this.ensuringSpaces.set(spaceId, ensurePromise);
    await ensurePromise;
    return this.ensuredSpaces.has(spaceId) ? spaceId : null;
  }

  async getActiveCollectionContext(
    profile: UserProfile,
    collection: SpaceCollection,
  ): Promise<ActiveSpaceDataContext> {
    const legacyRef = this.getLegacyCollectionRef(profile, collection);
    const spaceId = this.getCurrentSpaceId(profile);

    const canUseCanonical = await this.ensureSpecificCollectionData(
      spaceId,
      collection,
      profile,
      getActiveGroupId(profile) ? 'group' : 'personal',
    );

    if (!spaceId || this.isVirtualPersonalSpaceId(spaceId) || !canUseCanonical) {
      return {
        spaceId,
        canonicalRef: null,
        legacyRef,
        source: 'legacy',
      };
    }

    return {
      spaceId,
      canonicalRef: this.getCanonicalCollectionRef(spaceId, collection),
      legacyRef,
      source: 'canonical',
    };
  }

  async preferCanonicalSnapshot(profile: UserProfile, collection: SpaceCollection) {
    const context = await this.getActiveCollectionContext(profile, collection);

    if (!context.canonicalRef) {
      return {
        snapshot: await get(context.legacyRef),
        context,
      };
    }

    try {
      return {
        snapshot: await get(context.canonicalRef),
        context,
      };
    } catch (error: any) {
      if (!this.isPermissionDenied(error)) {
        throw error;
      }

      return {
        snapshot: await get(context.legacyRef),
        context: {
          ...context,
          source: 'legacy' as const,
        },
      };
    }
  }
}
