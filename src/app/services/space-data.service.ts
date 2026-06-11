import { Injectable, inject } from '@angular/core';
import {
  Database,
  DatabaseReference,
  get,
  ref,
  update,
} from '@angular/fire/database';
import { getActiveGroupId, UserProfile } from './user-data';

export type SpaceCollection = 'expenses' | 'incomes' | 'budgets' | 'categories' | 'vouchers';

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
  private readonly ensuredSpaces = new Set<string>();
  private readonly ensuringSpaces = new Map<string, Promise<void>>();
  private readonly ensuredCollections = new Set<string>();
  private readonly ensuringCollections = new Map<string, Promise<void>>();
  private readonly virtualPersonalPrefix = 'personal:';

  private isPermissionDenied(error: any): boolean {
    return error?.code === 'PERMISSION_DENIED' || error?.message === 'permission_denied';
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

  private async backfillCollection(spaceId: string, collection: SpaceCollection, profile: UserProfile): Promise<void> {
    const legacyRef = this.getLegacyCollectionRef(profile, collection);
    const canonicalRef = this.getCanonicalCollectionRef(spaceId, collection);

    const [legacySnapshot, canonicalSnapshot] = await Promise.all([
      get(legacyRef),
      get(canonicalRef),
    ]);

    if (!legacySnapshot.exists()) {
      return;
    }

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
      this.ensuredSpaces.add(spaceId);
    } catch (error: any) {
      if (!this.isPermissionDenied(error)) {
        throw error;
      }
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
