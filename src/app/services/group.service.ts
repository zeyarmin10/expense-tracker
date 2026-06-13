import { Injectable, inject, Injector } from '@angular/core';
import {
  Database,
  ref,
  push,
  update,
  onValue,
  get,
  query,
  orderByChild,
  equalTo,
} from '@angular/fire/database';
import { AuthService } from './auth';
import { CategoryService } from './category';
import { combineLatest, firstValueFrom, map, Observable, of, switchMap } from 'rxjs';
import { UserDataService, UserProfile } from './user-data';
import { Group } from './group.model'; // Import Group from the new model file
import { SpaceContextService } from './space-context.service';

export const MAX_SPACE_NAME_LENGTH = 50;

function isPermissionDenied(error: any): boolean {
  return error?.code === 'PERMISSION_DENIED' || error?.message === 'permission_denied';
}

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  private db: Database = inject(Database);
  private injector: Injector = inject(Injector);

  private authService!: AuthService;
  private categoryService!: CategoryService;
  private userDataService!: UserDataService;
  private spaceContextService!: SpaceContextService;

  // Lazy load services to break circular dependencies
  private getAuthService(): AuthService {
    if (!this.authService) {
      this.authService = this.injector.get(AuthService);
    }
    return this.authService;
  }

  private getCategoryService(): CategoryService {
    if (!this.categoryService) {
      this.categoryService = this.injector.get(CategoryService);
    }
    return this.categoryService;
  }

  private getUserDataService(): UserDataService {
    if (!this.userDataService) {
      this.userDataService = this.injector.get(UserDataService);
    }
    return this.userDataService;
  }

  private getSpaceContextService(): SpaceContextService {
    if (!this.spaceContextService) {
      this.spaceContextService = this.injector.get(SpaceContextService);
    }
    return this.spaceContextService;
  }

  async createGroup(groupName: string, language: string, imageUrl?: string | null): Promise<string> {
    const authService = this.getAuthService();
    const userDataService = this.getUserDataService();
    
    const userId = (await firstValueFrom(
      authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }

    const trimmedName = groupName.trim();
    if (!trimmedName) {
      throw new Error('Group name is required.');
    }
    if (trimmedName.length > MAX_SPACE_NAME_LENGTH) {
      throw new Error('Group name is too long.');
    }

    const userProfile = await firstValueFrom(userDataService.getUserProfile(userId));

    const personalSpaceId = userProfile?.personalSpaceId || '';
    const ownedGroupSpaces = Object.entries(userProfile?.spaceMemberships || {})
      .filter(([spaceId, role]) =>
        role === 'owner' &&
        spaceId !== personalSpaceId &&
        !spaceId.startsWith('personal:')
      );
    if (ownedGroupSpaces.length >= 5) {
      throw new Error('Space limit reached.');
    }

    const groupRef = push(ref(this.db, 'groups'));
    const newGroupId = groupRef.key!;
    if (!newGroupId) {
        throw new Error('Failed to create new group ID.');
    }
    
    const role = 'admin';
    
    const newGroup: Group = {
      groupName: trimmedName,
      ownerId: userId,
      currency: userProfile?.currency || 'MMK',
      budgetPeriod: userProfile?.budgetPeriod || null,
      selectedBudgetPeriodId: userProfile?.selectedBudgetPeriodId || null,
      createdAt: Date.now(),
      ...(imageUrl ? { imageUrl } : {}),
    };

    const legacyUpdates: { [key: string]: any } = {};
    legacyUpdates[`/groups/${newGroupId}`] = newGroup;
    legacyUpdates[`/group_members/${newGroupId}/${userId}`] = { role: role };
    if (!userProfile?.groupId) {
      legacyUpdates[`/users/${userId}/groupId`] = newGroupId;
    }
    legacyUpdates[`/users/${userId}/accountType`] = 'group';
    legacyUpdates[`/users/${userId}/currentSpaceId`] = newGroupId;
    legacyUpdates[`/users/${userId}/currentSpaceType`] = 'group';
    legacyUpdates[`/users/${userId}/currentSpaceName`] = trimmedName;
    legacyUpdates[`/users/${userId}/currentSpaceRole`] = 'owner';
    legacyUpdates[`/users/${userId}/roles/${newGroupId}`] = role;
    legacyUpdates[`/users/${userId}/spaceMemberships/${newGroupId}`] = 'owner';

    await update(ref(this.db), legacyUpdates);

    const spaceUpdates: { [key: string]: any } = {};
    spaceUpdates[`/spaces/${newGroupId}`] = {
      type: 'group',
      name: trimmedName,
      ownerId: userId,
      currency: userProfile?.currency || 'MMK',
      budgetPeriod: userProfile?.budgetPeriod || null,
      budgetStartDate: userProfile?.budgetStartDate || null,
      budgetEndDate: userProfile?.budgetEndDate || null,
      selectedBudgetPeriodId: userProfile?.selectedBudgetPeriodId || null,
      createdAt: Date.now(),
    };
    spaceUpdates[`/space_members/${newGroupId}/${userId}`] = { role: 'owner' };

    try {
      await update(ref(this.db), spaceUpdates);
    } catch (error: any) {
      if (!isPermissionDenied(error)) {
        throw error;
      }
    }

    // Lazily get CategoryService ONLY when it's needed
    const categoryService = this.getCategoryService();
    await categoryService.addDefaultGroupCategories(newGroupId, language);
    
    return newGroupId;
  }

  async updateGroupSettings(groupId: string, settings: Partial<Group>): Promise<void> {
    await update(ref(this.db, `groups/${groupId}`), settings);

    // Mirror imageUrl to /spaces/ node so getSpace() picks it up
    if ('imageUrl' in settings) {
      try {
        await update(ref(this.db, `spaces/${groupId}`), { imageUrl: settings.imageUrl ?? null });
      } catch (error: any) {
        if (!isPermissionDenied(error)) {
          throw error;
        }
      }
    }
  }

  async renameGroup(groupId: string, nextName: string): Promise<void> {
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      throw new Error('Group name is required.');
    }
    if (trimmedName.length > MAX_SPACE_NAME_LENGTH) {
      throw new Error('Group name is too long.');
    }

    const updates: Record<string, unknown> = {
      [`/groups/${groupId}/groupName`]: trimmedName,
      [`/spaces/${groupId}/name`]: trimmedName,
    };

    const memberSnapshot = await get(ref(this.db, `group_members/${groupId}`));
    if (memberSnapshot.exists()) {
      const memberIds = Object.keys(memberSnapshot.val() || {});
      await Promise.all(
        memberIds.map(async (memberId) => {
          const profile = await this.getUserDataService().fetchUserProfile(memberId);
          if (profile?.currentSpaceId === groupId) {
            updates[`/users/${memberId}/currentSpaceName`] = trimmedName;
          }
        }),
      );
    }

    await update(ref(this.db), updates);
  }

  getGroupName(groupId: string): Observable<string | null> {
    if (!groupId) return of(null);
    const groupRef = ref(this.db, `groups/${groupId}/groupName`);
    return new Observable(observer => {
      const unsubscribe = onValue(groupRef, snapshot => {
        observer.next(snapshot.exists() ? snapshot.val() : null);
      }, error => {
        observer.error(error);
      });
      return { unsubscribe };
    });
  }

  getGroupSettings(groupId: string): Observable<Group | null> {
    if (!groupId) return of(null);
    const groupRef = ref(this.db, `groups/${groupId}`);
    return new Observable(observer => {
      const unsubscribe = onValue(groupRef, snapshot => {
        if (snapshot.exists()) {
          observer.next(snapshot.val());
        } else {
          observer.next(null);
        }
      }, error => {
        observer.error(error);
      });
      // On unsubscribe, Firebase listener is detached
      return { unsubscribe };
    });
  }

  getGroupMembers(groupId: string): Observable<any[]> {
    if (!groupId) {
      return of([]);
    }
    const membersRef = ref(this.db, `group_members/${groupId}`);

    return new Observable<{[uid: string]: {role: string}} | null>(observer => {
      const unsubscribe = onValue(membersRef, snapshot => {
        observer.next(snapshot.exists() ? snapshot.val() : null);
      }, error => observer.error(error));
      return { unsubscribe };
    }).pipe(
        switchMap(members => {
            if (!members) {
                return of([]);
            }
            const memberObservables = Object.keys(members).map(uid => {
                const role = (members as any)[uid].role;
                return this.getUserDataService().getUserProfile(uid).pipe(
                    map(profile => ({
                        uid: uid,
                        displayName: profile?.displayName || 'Unknown Member',
                        photoURL: profile?.photoURL || null,
                        role: role
                    }))
                );
            });
            if (memberObservables.length === 0) {
                return of([]);
            }
            return combineLatest(memberObservables);
        })
    );
  }

  async removeMember(groupId: string, memberId: string): Promise<void> {
    const userProfile = await firstValueFrom(this.getUserDataService().getUserProfile(memberId));
    const fallbackSpaceId = userProfile?.personalSpaceId || `personal:${memberId}`;
    const legacyUpdates: { [key: string]: any } = {};

    legacyUpdates[`/group_members/${groupId}/${memberId}`] = null;
    legacyUpdates[`/users/${memberId}/spaceMemberships/${groupId}`] = null;
    legacyUpdates[`/users/${memberId}/roles/${groupId}`] = null;

    if (userProfile?.currentSpaceId === groupId) {
      legacyUpdates[`/users/${memberId}/currentSpaceId`] = fallbackSpaceId;
      legacyUpdates[`/users/${memberId}/currentSpaceType`] = 'personal';
      legacyUpdates[`/users/${memberId}/groupId`] = null;
      legacyUpdates[`/users/${memberId}/accountType`] = 'personal';
    }

    await update(ref(this.db), legacyUpdates);

    try {
      await update(ref(this.db), {
        [`/space_members/${groupId}/${memberId}`]: null,
      });
    } catch (error: any) {
      if (!isPermissionDenied(error)) {
        throw error;
      }
    }
  }

  async deleteGroup(groupId: string, actorId: string): Promise<void> {
    const groupSnapshot = await get(ref(this.db, `groups/${groupId}`));
    if (!groupSnapshot.exists()) {
      throw new Error('Group not found.');
    }

    const group = groupSnapshot.val() as Group;
    if (group.ownerId !== actorId) {
      throw new Error('Only the group owner can delete this space.');
    }

    const memberSnapshot = await get(ref(this.db, `group_members/${groupId}`));
    const members = memberSnapshot.exists() ? (memberSnapshot.val() as Record<string, { role: string }>) : {};
    const otherMemberIds = Object.keys(members).filter((memberId) => memberId !== actorId);

    if (otherMemberIds.length > 0) {
      throw new Error('Remove all other members before deleting this space.');
    }

    const invitationSnapshot = await get(
      query(ref(this.db, 'invitations'), orderByChild('groupId'), equalTo(groupId)),
    );
    const invitations = invitationSnapshot.exists()
      ? (invitationSnapshot.val() as Record<string, { status?: string }>)
      : {};
    const pendingInvitationIds = Object.entries(invitations)
      .filter(([, invitation]) => invitation?.status === 'pending')
      .map(([inviteId]) => inviteId);

    if (pendingInvitationIds.length > 0) {
      throw new Error('Revoke all pending invitations before deleting this space.');
    }

    const actorProfile = await this.getUserDataService().fetchUserProfile(actorId);
    if (!actorProfile) {
      throw new Error('User profile not found.');
    }

    const personalSpaceId =
      actorProfile.personalSpaceId ||
      (await this.getSpaceContextService().ensurePersonalSpace(actorId));

    const updates: Record<string, unknown> = {
      [`/groups/${groupId}`]: null,
      [`/group_members/${groupId}`]: null,
      [`/spaces/${groupId}`]: null,
      [`/space_members/${groupId}`]: null,
      [`/group_data/${groupId}`]: null,
      [`/users/${actorId}/groupId`]: null,
      [`/users/${actorId}/accountType`]: 'personal',
      [`/users/${actorId}/currentSpaceId`]: personalSpaceId,
      [`/users/${actorId}/currentSpaceType`]: 'personal',
      [`/users/${actorId}/currentSpaceRole`]: 'owner',
      [`/users/${actorId}/currentSpaceName`]: 'My Personal',
      [`/users/${actorId}/roles/${groupId}`]: null,
      [`/users/${actorId}/spaceMemberships/${groupId}`]: null,
    };

    for (const inviteId of Object.keys(invitations)) {
      updates[`/invitations/${inviteId}`] = null;
    }

    await update(ref(this.db), updates);
  }
}
