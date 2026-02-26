import { Injectable, inject, Injector } from '@angular/core';
import { Database, ref, push, update, onValue } from '@angular/fire/database';
import { AuthService } from './auth';
import { CategoryService } from './category';
import { firstValueFrom, map, Observable, of } from 'rxjs';
import { UserDataService } from './user-data';
import { Group } from './group.model'; // Import Group from the new model file

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  private db: Database = inject(Database);
  private injector: Injector = inject(Injector);

  private authService!: AuthService;
  private categoryService!: CategoryService;
  private userDataService!: UserDataService;

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

  async createGroup(groupName: string, language: string): Promise<string> {
    const authService = this.getAuthService();
    const userDataService = this.getUserDataService();
    
    const userId = (await firstValueFrom(
      authService.currentUser$.pipe(map((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }

    const userProfile = await firstValueFrom(userDataService.getUserProfile(userId));

    const groupRef = push(ref(this.db, 'groups'));
    const newGroupId = groupRef.key!;
    if (!newGroupId) {
        throw new Error('Failed to create new group ID.');
    }
    
    const role = 'admin';
    
    const newGroup: Group = {
      groupName: groupName,
      ownerId: userId,
      currency: userProfile?.currency || 'MMK',
      budgetPeriod: userProfile?.budgetPeriod || null,
      selectedBudgetPeriodId: userProfile?.selectedBudgetPeriodId || null
    };

    const updates: { [key: string]: any } = {};
    updates[`/groups/${newGroupId}`] = newGroup;
    updates[`/group_members/${newGroupId}/${userId}`] = { role: role };
    updates[`/users/${userId}/groupId`] = newGroupId;
    updates[`/users/${userId}/accountType`] = 'group';
    updates[`/users/${userId}/roles/${newGroupId}`] = role;

    await update(ref(this.db), updates);

    // Lazily get CategoryService ONLY when it's needed
    const categoryService = this.getCategoryService();
    await categoryService.addDefaultGroupCategories(newGroupId, language);
    
    return newGroupId;
  }

  async updateGroupSettings(groupId: string, settings: Partial<Group>): Promise<void> {
    const groupSettingsRef = ref(this.db, `groups/${groupId}`);
    return update(groupSettingsRef, settings);
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

  async removeMember(groupId: string, memberId: string): Promise<void> {
    const updates: { [key: string]: any } = {};

    updates[`/group_members/${groupId}/${memberId}`] = null;
    updates[`/users/${memberId}/groupId`] = null;
    updates[`/users/${memberId}/accountType`] = 'personal';
    updates[`/users/${memberId}/roles/${groupId}`] = null;

    await update(ref(this.db), updates);
  }
}
