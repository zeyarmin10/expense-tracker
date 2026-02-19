import { Injectable, inject } from '@angular/core';
import {
  Database,
  ref,
  push,
  get,
  update,
  set,
} from '@angular/fire/database';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  private db: Database = inject(Database);

  async createGroup(groupName: string, adminUid: string): Promise<string> {
    const newInviteCode = this.generateInviteCode();
    const groupRef = push(ref(this.db, 'groups'));
    const groupId = groupRef.key!;

    const updates: { [key: string]: any } = {};
    // As per your rules: { groupName, ownerId, inviteCode }
    updates[`/groups/${groupId}`] = { groupName: groupName, ownerId: adminUid, inviteCode: newInviteCode };
    updates[`/invite_codes/${newInviteCode}`] = groupId;
    updates[`/group_members/${groupId}/${adminUid}`] = 'admin'; // Use role string directly

    await update(ref(this.db), updates);
    return groupId;
  }

  async joinGroup(inviteCode: string, userUid: string): Promise<string | null> {
    // 1. Find the groupId from the invite code
    const inviteCodeRef = ref(this.db, `invite_codes/${inviteCode}`);
    const snapshot = await get(inviteCodeRef);

    if (snapshot.exists()) {
      const groupId = snapshot.val();
      // 2. Add the user to the group_members list with the 'member' role
      const memberRef = ref(this.db, `/group_members/${groupId}/${userUid}`);
      await set(memberRef, 'member');
      return groupId;
    } else {
      return null; // Invalid invite code
    }
  }

  private generateInviteCode(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
