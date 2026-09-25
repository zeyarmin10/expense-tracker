import { Injectable, inject, Injector } from '@angular/core';
import {
  Database,
  ref,
  set,
  update,
  objectVal,
  get,
  remove
} from '@angular/fire/database';
import { BehaviorSubject, Observable, concat, EMPTY, from, merge, of } from 'rxjs';
import { filter, map, switchMap, tap } from 'rxjs/operators';
import { DataManagerService } from './data-manager';
import { Space, SpaceRole, SpaceType } from './space.model';
import { OfflineStoreService } from './offline-store.service';

// Publicly-readable subset of a profile (see `user_public/{uid}` in the DB
// rules) — anyone signed in may read this, so it must never carry anything
// beyond display identity (no email, currency, space membership, etc).
export interface PublicUserProfile {
  displayName?: string | null;
  photoURL?: string | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  currency: string;
  language: string;
  createdAt: number;
  accountType?: 'personal' | 'group';
  groupId?: string | null;
  personalSpaceId?: string;
  currentSpaceId?: string;
  currentSpaceType?: SpaceType;
  currentSpaceName?: string;
  currentSpaceRole?: SpaceRole;
  spaceMemberships?: { [key: string]: SpaceRole };
  budgetPeriod?: 'weekly' | 'monthly' | 'yearly' | 'custom' | null;
  budgetStartDate?: string | null;
  budgetEndDate?: string | null;
  selectedBudgetPeriodId?: string | null;
  lastAvatarUploadAt?: number | null;
  // Explicitly `false` (not merely absent) for brand-new accounts so the
  // welcome tour shows once for them without also showing for pre-existing
  // accounts that predate this field — see WelcomeTourComponent.
  hasSeenWelcomeTour?: boolean;
}

type SpaceContextLike = {
  currentSpaceId?: string | null;
  currentSpaceType?: SpaceType | null;
  groupId?: string | null;
  accountType?: 'personal' | 'group' | null;
  personalSpaceId?: string | null;
  spaceMemberships?: { [key: string]: SpaceRole } | null;
};

export function getActiveGroupId(profile: SpaceContextLike | null | undefined): string | null {
  if (!profile) {
    return null;
  }

  if (profile.currentSpaceType === 'group' && profile.currentSpaceId) {
    return profile.currentSpaceId;
  }

  if (profile.currentSpaceType === 'personal') {
    return null;
  }

  if (
    profile.accountType === 'group' &&
    profile.currentSpaceId &&
    profile.currentSpaceId !== profile.personalSpaceId &&
    (!profile.spaceMemberships || !!profile.spaceMemberships[profile.currentSpaceId])
  ) {
    return profile.currentSpaceId;
  }

  return profile.groupId || null;
}

export function isPersonalContext(profile: SpaceContextLike | null | undefined): boolean {
  return !getActiveGroupId(profile) && profile?.currentSpaceType !== 'group';
}

export function getCurrentSpaceRole(profile: UserProfile | null | undefined): SpaceRole | null {
  if (!profile) {
    return null;
  }

  if (profile.currentSpaceType === 'group' && profile.currentSpaceId) {
    return (
      profile.currentSpaceRole ||
      profile.spaceMemberships?.[profile.currentSpaceId] ||
      null
    );
  }

  const activeGroupId = getActiveGroupId(profile);
  if (!activeGroupId) {
    return profile.currentSpaceRole || null;
  }

  return (
    profile.spaceMemberships?.[activeGroupId] ||
    profile.currentSpaceRole ||
    null
  );
}

export function canManageSharedSpace(profile: UserProfile | null | undefined): boolean {
  if (!profile) {
    return false;
  }

  if (profile.accountType === 'personal') {
    return true;
  }

  const role = getCurrentSpaceRole(profile);
  return role === 'admin' || role === 'owner';
}

@Injectable({
  providedIn: 'root',
})
export class UserDataService {
  private db: Database = inject(Database);
  private offlineStore = inject(OfflineStoreService);
  private dataManagerService!: DataManagerService;
  private readonly offlineProfileChanges = new Map<string, BehaviorSubject<UserProfile | null>>();

  constructor(private injector: Injector) {}

  private getDataManagerService(): DataManagerService {
    if (!this.dataManagerService) {
      this.dataManagerService = this.injector.get(DataManagerService);
    }
    return this.dataManagerService;
  }

  getUserProfile(userId: string): Observable<UserProfile | null> {
    const userRef = ref(this.db, `users/${userId}`);
    const localChanges$ = this.getOfflineProfileChanges(userId).pipe(
      filter((profile): profile is UserProfile => profile !== null),
      map(profile => this.withUserId(userId, profile)),
    );
    const cached$ = from(this.offlineStore.getProfile<UserProfile>(userId)).pipe(
      switchMap(profile => profile ? of(this.withUserId(userId, profile)) : EMPTY),
    );
    const remote$ = objectVal<UserProfile>(userRef).pipe(
      tap(profile => {
        if (profile) void this.offlineStore.cacheProfile(userId, this.withUserId(userId, profile));
      }),
      // Do not replace a usable cached profile with a transient offline null.
      filter((profile): profile is UserProfile => profile !== null),
      map(profile => this.withUserId(userId, profile)),
    );
    // A space switch made offline cannot update Firebase immediately. Keep a
    // small local stream alongside the remote listener so the active-space
    // context changes instantly, then let Firebase become authoritative again
    // once the queued update is replayed.
    return concat(cached$, merge(localChanges$, remote$));
  }

  private withUserId(userId: string, profile: UserProfile): UserProfile {
    return {
      ...profile,
      uid: profile.uid || userId,
    };
  }

  async updateCachedProfile(userId: string, changes: Partial<UserProfile>): Promise<UserProfile> {
    const current = await this.offlineStore.getProfile<UserProfile>(userId);
    if (!current) throw new Error('Offline profile is not available on this device.');
    const updated = { ...current, ...changes, uid: current.uid || userId } as UserProfile;
    await this.offlineStore.cacheProfile(userId, updated);
    this.getOfflineProfileChanges(userId).next(updated);
    return updated;
  }

  async getCachedProfile(userId: string): Promise<UserProfile | null> {
    return this.offlineStore.getProfile<UserProfile>(userId);
  }

  /** Creates a device-local profile after Firebase Auth succeeds but the
   * RTDB route is unavailable. The server write is conditional, so a later
   * reconnect cannot overwrite an already-existing account profile. */
  async provisionOfflineProfile(profile: UserProfile): Promise<void> {
    const virtualPersonalSpaceId = `personal:${profile.uid}`;
    const localProfile: UserProfile = {
      ...profile,
      accountType: 'personal',
      groupId: null,
      currentSpaceId: profile.currentSpaceId || virtualPersonalSpaceId,
      currentSpaceType: 'personal',
      currentSpaceName: profile.currentSpaceName || 'My Personal',
      currentSpaceRole: 'owner',
      spaceMemberships: {
        [virtualPersonalSpaceId]: 'owner',
        ...(profile.spaceMemberships || {}),
      },
    };
    await this.offlineStore.cacheProfile(profile.uid, localProfile);
    await this.offlineStore.replaceCollection(profile.uid, 'spaces', {
      [virtualPersonalSpaceId]: {
        id: virtualPersonalSpaceId,
        type: 'personal',
        name: 'My Personal',
        ownerId: profile.uid,
        currency: localProfile.currency || 'MMK',
        budgetPeriod: localProfile.budgetPeriod || null,
        budgetStartDate: localProfile.budgetStartDate || null,
        budgetEndDate: localProfile.budgetEndDate || null,
        selectedBudgetPeriodId: localProfile.selectedBudgetPeriodId || null,
        imageUrl: localProfile.photoURL || null,
        createdAt: localProfile.createdAt || Date.now(),
        role: 'owner',
      },
    });
    this.getOfflineProfileChanges(profile.uid).next(localProfile);
    const path = `users/${profile.uid}`;
    const alreadyQueued = (await this.offlineStore.pendingOperations()).some(operation =>
      operation.kind === 'setIfMissing' && operation.path === path,
    );
    if (!alreadyQueued) {
      await this.offlineStore.enqueue({
        id: this.offlineStore.createId('op'),
        kind: 'setIfMissing',
        path,
        payload: localProfile as unknown as Record<string, unknown>,
        createdAt: this.offlineStore.nextOperationTimestamp(),
        attempts: 0,
      });
    }
  }

  async updateOfflineProfile(userId: string, changes: Partial<UserProfile>): Promise<UserProfile> {
    const updated = await this.updateCachedProfile(userId, changes);
    await this.offlineStore.enqueue({
      id: this.offlineStore.createId('op'),
      kind: 'update',
      path: `users/${userId}`,
      payload: changes as Record<string, unknown>,
      createdAt: this.offlineStore.nextOperationTimestamp(),
      attempts: 0,
    });
    return updated;
  }

  private getOfflineProfileChanges(userId: string): BehaviorSubject<UserProfile | null> {
    let changes = this.offlineProfileChanges.get(userId);
    if (!changes) {
      changes = new BehaviorSubject<UserProfile | null>(null);
      this.offlineProfileChanges.set(userId, changes);
    }
    return changes;
  }

  async fetchUserProfile(userId: string): Promise<UserProfile | null> {
    const userRef = ref(this.db, `users/${userId}`);
    const snapshot = await get(userRef);
    return snapshot.exists() ? snapshot.val() as UserProfile : null;
  }

  // The public mirror — readable by any signed-in user, regardless of
  // shared space membership. This is what cross-user display (member
  // lists, "created by" badges) should read instead of the full profile.
  getPublicProfile(userId: string): Observable<PublicUserProfile | null> {
    const publicRef = ref(this.db, `user_public/${userId}`);
    return objectVal<PublicUserProfile>(publicRef);
  }

  private lastMirroredSignature = new Map<string, string>();

  // Best-effort, deduped mirror of the display-identity fields into
  // `user_public/{uid}`. Safe to call on every profile emission — it only
  // actually writes when displayName/photoURL have changed since last call.
  mirrorPublicProfile(userId: string, displayName: string | null | undefined, photoURL: string | null | undefined): void {
    const signature = `${displayName || ''}|${photoURL || ''}`;
    if (this.lastMirroredSignature.get(userId) === signature) {
      return;
    }
    this.lastMirroredSignature.set(userId, signature);
    update(ref(this.db, `user_public/${userId}`), {
      displayName: displayName || null,
      photoURL: photoURL || null,
    }).catch(() => {
      this.lastMirroredSignature.delete(userId);
    });
  }

  async createUserProfile(profile: UserProfile): Promise<void> {
      const userRef = ref(this.db, `users/${profile.uid}`);
      this.mirrorPublicProfile(profile.uid, profile.displayName, profile.photoURL);
      await set(userRef, profile);
      await this.offlineStore.cacheProfile(profile.uid, profile);
      this.getOfflineProfileChanges(profile.uid).next(profile);
  }

  async updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
    const userRef = ref(this.db, `users/${userId}`);
    await update(userRef, data);

    const userProfile = await this.fetchUserProfile(userId);

    if (data.displayName !== undefined || data.photoURL !== undefined) {
      this.mirrorPublicProfile(userId, userProfile?.displayName, userProfile?.photoURL);
    }

    const activeGroupId = userProfile?.currentSpaceType === 'group'
      ? userProfile.currentSpaceId
      : userProfile?.groupId;
    const activeRole = activeGroupId
      ? userProfile?.spaceMemberships?.[activeGroupId]
      : null;

    if (activeGroupId && (activeRole === 'admin' || activeRole === 'owner')) {
      const groupSettings: Partial<Space> = {};
      if (data.currency) {
        groupSettings.currency = data.currency;
      }
      if (data.budgetPeriod) {
        groupSettings.budgetPeriod = data.budgetPeriod;
      }
      if (Object.keys(groupSettings).length > 0) {
        await this.getDataManagerService().updateGroupSettings(activeGroupId, groupSettings);
      }
    }
  }

  async deleteUserData(userId: string): Promise<void> {
    const userRef = ref(this.db, `users/${userId}`);
    await remove(userRef);
  }
}
