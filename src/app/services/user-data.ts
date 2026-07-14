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
import { Observable } from 'rxjs';
import { DataManagerService } from './data-manager';
import { Space, SpaceRole, SpaceType } from './space.model';

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
};

export function getActiveGroupId(profile: SpaceContextLike | null | undefined): string | null {
  if (!profile) {
    return null;
  }

  if (profile.currentSpaceType === 'group' && profile.currentSpaceId) {
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
  private dataManagerService!: DataManagerService;

  constructor(private injector: Injector) {}

  private getDataManagerService(): DataManagerService {
    if (!this.dataManagerService) {
      this.dataManagerService = this.injector.get(DataManagerService);
    }
    return this.dataManagerService;
  }

  getUserProfile(userId: string): Observable<UserProfile | null> {
    const userRef = ref(this.db, `users/${userId}`);
    return objectVal<UserProfile>(userRef);
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

  createUserProfile(profile: UserProfile): Promise<void> {
      const userRef = ref(this.db, `users/${profile.uid}`);
      this.mirrorPublicProfile(profile.uid, profile.displayName, profile.photoURL);
      return set(userRef, profile);
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
