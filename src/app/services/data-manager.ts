
import { Injectable, inject } from '@angular/core';
import {
  Database,
  ref,
  push,
  set,
  update,
  remove,
  listVal,
  get,
  query,
  orderByChild,
  equalTo,
} from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom, of, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from './auth';
import { DataICategory, DataIExpense, IGroupMember, IUserProfile } from '../core/models/data'; // Changed to IUserProfile
import { UserDataService } from './user-data';

@Injectable({
  providedIn: 'root',
})
export class DataManagerService {
  private db: Database = inject(Database);
  private authService: AuthService = inject(AuthService);
  private userDataService: UserDataService = inject(UserDataService);

  // ... (rest of the functions like createGroup, joinGroup remain the same)
  async createGroup(groupName: string, userId: string): Promise<void> {
    const newInviteCode = this.generateInviteCode();
    const groupRef = push(ref(this.db, 'groups'));
    const groupId = groupRef.key!;
    const role = 'admin';

    const updates: { [key: string]: any } = {};
    updates[`/groups/${groupId}`] = { groupName, ownerId: userId, inviteCode: newInviteCode };
    updates[`/invite_codes/${newInviteCode}`] = groupId;
    updates[`/group_members/${groupId}/${userId}`] = role;
    updates[`/users/${userId}/groupId`] = groupId;
    updates[`/users/${userId}/accountType`] = 'group';
    updates[`/users/${userId}/roles/${groupId}`] = role;

    return update(ref(this.db), updates);
  }

  async joinGroup(inviteCode: string, userId: string): Promise<boolean> {
    const codeRef = ref(this.db, `invite_codes/${inviteCode}`);
    const snapshot = await get(codeRef);

    if (snapshot.exists()) {
      const groupId = snapshot.val();
      const role = 'member';
      const updates: { [key: string]: any } = {};
      updates[`/group_members/${groupId}/${userId}`] = role;
      updates[`/users/${userId}/groupId`] = groupId;
      updates[`/users/${userId}/accountType`] = 'group';
      updates[`/users/${userId}/roles/${groupId}`] = role;
      await update(ref(this.db), updates);
      return true;
    }
    return false;
  }

  async removeGroupMember(groupId: string, memberId: string): Promise<void> {
    const updates: { [key: string]: any } = {};
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
      map(snapshot => (snapshot.exists() ? snapshot.val() : null))
    );
  }

  private generateInviteCode(): string {
    return `GR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  // --- Member, Group & Invitation Management ---

  getGroupMembers(groupId: string): Observable<IGroupMember[]> {
    const path = `group_members/${groupId}`;
    return listVal<any>(ref(this.db, path), { keyField: 'uid' });
  }
  
  async getGroupDetails(groupId: string): Promise<any> {
      const groupRef = ref(this.db, `groups/${groupId}`);
      const snapshot = await get(groupRef);
      return snapshot.exists() ? snapshot.val() : null;
  }

  async sendGroupInvitation(
    groupId: string,
    groupName: string,
    invitedBy: IUserProfile, // Changed to IUserProfile
    recipientEmail: string
  ): Promise<void> {
    const inviteRef = push(ref(this.db, 'invitations'));
    const newInvitation = {
      groupId,
      groupName,
      recipientEmail: recipientEmail.toLowerCase(),
      invitedBy: {
        uid: invitedBy.uid,
        displayName: invitedBy.displayName || 'A member',
        email: invitedBy.email,
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    return set(inviteRef, newInvitation);
  }

  getPendingInvitations(groupId: string): Observable<any[]> {
    const invitesRef = query(
      ref(this.db, 'invitations'),
      orderByChild('groupId'),
      equalTo(groupId)
    );
    return listVal(invitesRef, { keyField: 'key' }).pipe(
      map((invites) => invites.filter((inv: any) => inv.status === 'pending')) // Added :any type
    );
  }

  async revokeGroupInvitation(inviteKey: string): Promise<void> {
    const inviteRef = ref(this.db, `invitations/${inviteKey}`);
    return remove(inviteRef);
  }

  // ... (rest of the file like getDataPath, etc.)
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
