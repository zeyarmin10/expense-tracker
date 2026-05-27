import { Injectable, inject } from '@angular/core';
import {
  Database,
  DatabaseReference,
  get,
  ref,
  update,
} from '@angular/fire/database';
import { getActiveGroupId, UserProfile } from './user-data';

export type SpaceCollection = 'expenses' | 'incomes' | 'budgets' | 'categories';

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
      this.ensuredSpaces.add(spaceId);
    } catch (error: any) {
      if (!this.isPermissionDenied(error)) {
        throw error;
      }
    }
  }

  async ensureActiveSpaceData(profile: UserProfile): Promise<string | null> {
    const spaceId = this.getCurrentSpaceId(profile);
    if (!spaceId || this.isVirtualPersonalSpaceId(spaceId) || this.ensuredSpaces.has(spaceId)) {
      return spaceId;
    }

    await this.ensureSpecificSpaceData(
      spaceId,
      profile,
      getActiveGroupId(profile) ? 'group' : 'personal',
    );
    return this.ensuredSpaces.has(spaceId) ? spaceId : null;
  }

  async migrateAllUserSpaces(profile: UserProfile): Promise<void> {
    await this.ensureSpecificSpaceData(profile.personalSpaceId || null, profile, 'personal');

    const allMemberships = {
      ...(profile.spaceMemberships || {}),
      ...(profile.roles || {}),
    };

    for (const spaceId of Object.keys(allMemberships)) {
      if (spaceId !== profile.personalSpaceId) {
        await this.ensureSpecificSpaceData(spaceId, profile, 'group');
      }
    }
  }

  async getActiveCollectionContext(
    profile: UserProfile,
    collection: SpaceCollection,
  ): Promise<ActiveSpaceDataContext> {
    const legacyRef = this.getLegacyCollectionRef(profile, collection);
    const spaceId = await this.ensureActiveSpaceData(profile);

    if (!spaceId || this.isVirtualPersonalSpaceId(spaceId)) {
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
