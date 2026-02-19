import { Injectable, inject } from '@angular/core';
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

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  currency: string;
  language: string;
  createdAt: number; 
  accountType?: 'personal' | 'group';
  groupId?: string;
  roles?: string; // Changed to string type as requested
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

  updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
    const userRef = ref(this.db, `users/${userId}`);
    return update(userRef, data);
  }

  async deleteUserData(userId: string): Promise<void> {
    const userRef = ref(this.db, `users/${userId}`);
    await remove(userRef);
  }

  async migrateUserProfileIfNeeded(userId: string): Promise<void> {
    const profile = await this.fetchUserProfile(userId);
    if (profile) {
      const updates: Partial<UserProfile> = {};
      
      if (!profile.accountType) {
        updates.accountType = profile.groupId ? 'group' : 'personal';
      }
      
      // If roles is not a string (it might be the old object or undefined)
      if (typeof profile.roles !== 'string') {
        // Default to a non-admin role for safety during migration.
        // Users might need to re-select roles in onboarding if they were admins.
        updates.roles = 'member'; 
      }

      if (Object.keys(updates).length > 0) {
        await this.updateUserProfile(userId, updates);
      }
    }
  }
}
