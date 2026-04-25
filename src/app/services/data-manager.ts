import { Injectable, inject } from '@angular/core';
import {
  Database,
  ref,
  remove,
  listVal,
  get,
  query,
  orderByChild,
  equalTo,
  update,
} from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom, of, from, combineLatest, map as rxMap } from 'rxjs';
import { AuthService } from './auth';
import { IGroupMember, IUserProfile, IInvitation } from '../core/models/data';
import { UserDataService } from './user-data';
import { Invitation } from './invitation.service';
import { SpaceContextService } from './space-context.service';

export interface IGroupDetails {
  groupName: string;
  ownerId: string;
}

// New interface for the combined member data
export interface IGroupMemberDetails extends IUserProfile {
  role: string; // Add role to the user profile data
}

@Injectable({
  providedIn: 'root',
})
export class DataManagerService {
  private db: Database = inject(Database);
  private authService: AuthService = inject(AuthService);
  private userDataService: UserDataService = inject(UserDataService);
  private spaceContextService: SpaceContextService = inject(SpaceContextService);

  async acceptGroupInvitation(inviteCode: string, userId: string): Promise<void> {
    const inviteRef = ref(this.db, `invitations/${inviteCode}`);
    const inviteSnapshot = await get(inviteRef);

    if (!inviteSnapshot.exists()) {
      throw new Error('Invitation not found');
    }

    const invitation = inviteSnapshot.val() as Invitation;

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is not pending');
    }

    const groupId = invitation.groupId;
    const role = 'member'; // Default role for new members

    const groupDetails = await this.getGroupDetails(groupId);
    const legacyUpdates: { [key: string]: any } = {};

    legacyUpdates[`/group_members/${groupId}/${userId}`] = { role };
    legacyUpdates[`/users/${userId}/accountType`] = 'group';
    legacyUpdates[`/users/${userId}/groupId`] = groupId;
    legacyUpdates[`/users/${userId}/currentSpaceId`] = groupId;
    legacyUpdates[`/users/${userId}/currentSpaceType`] = 'group';
    legacyUpdates[`/users/${userId}/currentSpaceName`] = groupDetails?.groupName || 'Group';
    legacyUpdates[`/users/${userId}/currentSpaceRole`] = role;
    legacyUpdates[`/users/${userId}/roles/${groupId}`] = role;
    legacyUpdates[`/users/${userId}/spaceMemberships/${groupId}`] = role;
    legacyUpdates[`/invitations/${inviteCode}/status`] = 'accepted';
    legacyUpdates[`/invitations/${inviteCode}/acceptedBy`] = userId;
    legacyUpdates[`/invitations/${inviteCode}/acceptedAt`] = new Date().toISOString();

    await update(ref(this.db), legacyUpdates);

    try {
      await update(ref(this.db), {
        [`/space_members/${groupId}/${userId}`]: { role },
      });
    } catch (error: any) {
      const isPermissionDenied =
        error?.code === 'PERMISSION_DENIED' ||
        error?.message === 'permission_denied';

      if (!isPermissionDenied) {
        throw error;
      }
    }
  }

  getGroupMembersWithProfile(groupId: string): Observable<IGroupMemberDetails[]> {
    const membersRef = ref(this.db, `group_members/${groupId}`);
    return listVal<any>(membersRef, { keyField: 'uid' }).pipe(
      switchMap(members => {
        if (!members || members.length === 0) {
          return of([]);
        }
        const memberProfiles$ = members.map(member => 
          this.userDataService.getUserProfile(member.uid).pipe(
            rxMap(profile => ({
              ...profile,
              uid: member.uid, // ensure uid is carried over
              role: member.role // combine role from group_members
            } as IGroupMemberDetails))
          )
        );
        return combineLatest(memberProfiles$);
      })
    );
  }

  async removeGroupMember(groupId: string, memberId: string): Promise<void> {
    const updates: { [key:string]: any } = {};
    const userProfile = await firstValueFrom(this.userDataService.getUserProfile(memberId));
    const fallbackSpaceId =
      userProfile?.personalSpaceId ||
      (await this.spaceContextService.ensurePersonalSpace(memberId));

    updates[`/group_members/${groupId}/${memberId}`] = null;
    updates[`/space_members/${groupId}/${memberId}`] = null;
    updates[`/users/${memberId}/spaceMemberships/${groupId}`] = null;
    updates[`/users/${memberId}/roles/${groupId}`] = null;

    if (userProfile?.currentSpaceId === groupId || userProfile?.groupId === groupId) {
      updates[`/users/${memberId}/currentSpaceId`] = fallbackSpaceId;
      updates[`/users/${memberId}/currentSpaceType`] = 'personal';
      updates[`/users/${memberId}/currentSpaceName`] = 'My Personal';
      updates[`/users/${memberId}/currentSpaceRole`] = 'owner';
      updates[`/users/${memberId}/groupId`] = null;
      updates[`/users/${memberId}/accountType`] = 'personal';
    }

    return update(ref(this.db), updates);
  }

  getUserRoleInGroup(groupId: string, userId: string): Observable<string | null> {
    if (!groupId || !userId) {
      return of(null);
    }
    const roleRef = ref(this.db, `users/${userId}/roles/${groupId}`);
    return from(get(roleRef)).pipe(
      rxMap(snapshot => (snapshot.exists() ? snapshot.val() : null))
    );
  }

  // --- Member, Group & Invitation Management ---

  // This function is now much simpler. It reads denormalized data directly.
  getGroupMembers(groupId: string): Observable<IGroupMember[]> {
    const membersRef = ref(this.db, `group_members/${groupId}`);
    return listVal<IGroupMember>(membersRef, { keyField: 'uid' });
  }

  async getGroupDetails(groupId: string): Promise<IGroupDetails | null> {
      const groupRef = ref(this.db, `groups/${groupId}`);
      const snapshot = await get(groupRef);
      return snapshot.exists() ? snapshot.val() as IGroupDetails : null;
  }

  getPendingInvitations(groupId: string): Observable<IInvitation[]> {
    const invitesRef = query(
      ref(this.db, 'invitations'),
      orderByChild('groupId'),
      equalTo(groupId)
    );
    return listVal<IInvitation>(invitesRef, { keyField: 'key' }).pipe(
      rxMap((invites) => invites.filter(inv => inv.status === 'pending'))
    );
  }

  async revokeGroupInvitation(inviteKey: string): Promise<void> {
    const inviteRef = ref(this.db, `invitations/${inviteKey}`);
    return remove(inviteRef);
  }

  private getDataPath(
    dataType: 'categories' | 'expenses'
  ): Observable<string | null> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user) return of(null);
        return this.userDataService.getUserProfile(user.uid).pipe(
          switchMap(userProfile => {
            if (userProfile?.accountType === 'group' && userProfile.groupId) {
              return of(`group_data/${userProfile.groupId}/${dataType}`);
            } else if (userProfile?.accountType === 'personal') {
              return of(`users/${user.uid}/${dataType}`);
            }
            return of(null);
          })
        );
      })
    );
  }
}
