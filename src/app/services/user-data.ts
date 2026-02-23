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
import { GroupService } from './group.service';
import { Group } from './group.model'; // Import Group from the new model file

export type Role = 'admin' | 'member';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  currency: string;
  language: string;
  createdAt: number; 
  accountType?: 'personal' | 'group';
  groupId?: string;
  roles?: { [key: string]: Role }; 
  budgetPeriod?: 'weekly' | 'monthly' | 'yearly' | 'custom' | null;
  budgetStartDate?: string | null;
  budgetEndDate?: string | null;
  selectedBudgetPeriodId?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class UserDataService {
  private db: Database = inject(Database);
  private groupService!: GroupService;

  constructor(private injector: Injector) {}

  private getGroupService(): GroupService {
    if (!this.groupService) {
      this.groupService = this.injector.get(GroupService);
    }
    return this.groupService;
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

  createUserProfile(profile: UserProfile): Promise<void> {
      const userRef = ref(this.db, `users/${profile.uid}`);
      return set(userRef, profile);
  }

  async updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
    const userRef = ref(this.db, `users/${userId}`);
    await update(userRef, data);

    const userProfile = await this.fetchUserProfile(userId);
    if (userProfile?.groupId && userProfile.roles?.[userProfile.groupId] === 'admin') {
      const groupSettings: Partial<Group> = {};
      if (data.currency) {
        groupSettings.currency = data.currency;
      }
      if (data.budgetPeriod) {
        groupSettings.budgetPeriod = data.budgetPeriod;
      }
      if (Object.keys(groupSettings).length > 0) {
        await this.getGroupService().updateGroupSettings(userProfile.groupId, groupSettings);
      }
    }
  }

  async deleteUserData(userId: string): Promise<void> {
    const userRef = ref(this.db, `users/${userId}`);
    await remove(userRef);
  }
}
