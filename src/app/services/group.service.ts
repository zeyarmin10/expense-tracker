import { Injectable, inject, Injector } from '@angular/core';
import { Database, ref, push, update, onValue } from '@angular/fire/database';
import { AuthService } from './auth';
import { CategoryService } from './category';
import { combineLatest, firstValueFrom, map, Observable, of, switchMap } from 'rxjs';
import { UserDataService, UserProfile } from './user-data';
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
      selectedBudgetPeriodId: userProfile?.selectedBudgetPeriodId || null,
      createdAt: Date.now(),
    };

    const legacyUpdates: { [key: string]: any } = {};
    legacyUpdates[`/groups/${newGroupId}`] = newGroup;
    legacyUpdates[`/group_members/${newGroupId}/${userId}`] = { role: role };
    legacyUpdates[`/users/${userId}/groupId`] = newGroupId;
    legacyUpdates[`/users/${userId}/accountType`] = 'group';
    legacyUpdates[`/users/${userId}/currentSpaceId`] = newGroupId;
    legacyUpdates[`/users/${userId}/currentSpaceType`] = 'group';
    legacyUpdates[`/users/${userId}/currentSpaceName`] = groupName;
    legacyUpdates[`/users/${userId}/currentSpaceRole`] = 'owner';
    legacyUpdates[`/users/${userId}/roles/${newGroupId}`] = role;
    legacyUpdates[`/users/${userId}/spaceMemberships/${newGroupId}`] = 'owner';

    await update(ref(this.db), legacyUpdates);

    const spaceUpdates: { [key: string]: any } = {};
    spaceUpdates[`/spaces/${newGroupId}`] = {
      type: 'group',
      name: groupName,
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
      const isPermissionDenied =
        error?.code === 'PERMISSION_DENIED' ||
        error?.message === 'permission_denied';

      if (!isPermissionDenied) {
        throw error;
      }
    }

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
    const updates: { [key: string]: any } = {};
    const userProfile = await firstValueFrom(this.getUserDataService().getUserProfile(memberId));
    const fallbackSpaceId = userProfile?.personalSpaceId || null;

    updates[`/group_members/${groupId}/${memberId}`] = null;
    updates[`/space_members/${groupId}/${memberId}`] = null;
    updates[`/users/${memberId}/spaceMemberships/${groupId}`] = null;
    updates[`/users/${memberId}/roles/${groupId}`] = null;

    if (userProfile?.currentSpaceId === groupId) {
      updates[`/users/${memberId}/currentSpaceId`] = fallbackSpaceId;
      updates[`/users/${memberId}/currentSpaceType`] = 'personal';
      updates[`/users/${memberId}/groupId`] = null;
      updates[`/users/${memberId}/accountType`] = 'personal';
    }

    await update(ref(this.db), updates);
  }
}
