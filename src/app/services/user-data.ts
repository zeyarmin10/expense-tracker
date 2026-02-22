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
import { GroupService } from './group.service';

export type Role = 'admin' | 'member'; // Define the possible roles

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  currency: string;
  language: string;
  createdAt: number; 
  accountType?: 'personal' | 'group';
  groupId?: string;
  // Use a specific type for roles for better type safety
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
}
