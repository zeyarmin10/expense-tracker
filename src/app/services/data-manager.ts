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

    const updates: { [key: string]: any } = {};

    // Add user to group_members
    updates[`/group_members/${groupId}/${userId}`] = { role };

    // Update user's profile
    updates[`/users/${userId}/accountType`] = 'group';
    updates[`/users/${userId}/groupId`] = groupId;
    updates[`/users/${userId}/roles/${groupId}`] = role;

    // Update invitation status
    updates[`/invitations/${inviteCode}/status`] = 'accepted';
    updates[`/invitations/${inviteCode}/acceptedBy`] = userId;
    updates[`/invitations/${inviteCode}/acceptedAt`] = new Date().toISOString();

    return update(ref(this.db), updates);
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
    updates[`/group_members/${groupId}/${memberId}`] = null;
    updates[`/users/${memberId}/roles/${groupId}`] = null;

    const userProfile = await firstValueFrom(this.userDataService.getUserProfile(memberId));
    if (userProfile?.groupId === groupId) {
      updates[`/users/${memberId}/groupId`] = null;
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
