import { Injectable, inject } from '@angular/core';
import { Database, ref, push, update } from '@angular/fire/database';
import { AuthService } from './auth';
import { CategoryService } from './category';
import { firstValueFrom, map } from 'rxjs';

export interface Group {
  groupName: string;
  ownerId: string;
}

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  private db: Database = inject(Database);
  private authService = inject(AuthService);
  private categoryService = inject(CategoryService);

  async createGroup(groupName: string, language: string): Promise<string> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }

    const groupRef = push(ref(this.db, 'groups'));
    const newGroupId = groupRef.key!;
    if (!newGroupId) {
        throw new Error('Failed to create new group ID.');
    }
    
    const role = 'admin';
    
    const newGroup: Group = {
      groupName: groupName,
      ownerId: userId,
    };

    const updates: { [key: string]: any } = {};
    updates[`/groups/${newGroupId}`] = newGroup;
    updates[`/group_members/${newGroupId}/${userId}`] = { role: role };
    updates[`/users/${userId}/groupId`] = newGroupId;
    updates[`/users/${userId}/accountType`] = 'group';
    updates[`/users/${userId}/roles/${newGroupId}`] = role;

    // First, perform the database updates
    await update(ref(this.db), updates);

    // After the group is created, add the default categories
    await this.categoryService.addDefaultGroupCategories(newGroupId, language);
    
    return newGroupId;
  }
}
