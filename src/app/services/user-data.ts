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
import { Observable, from } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

// Represents the structure of the user's profile data in the database.
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  currency: string;
  language: string;
  createdAt: number; // Stored as a timestamp
  accountType?: 'personal' | 'group';
  groupId?: string;
  // Deprecated fields, kept for migration purposes
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

  // This function now transparently handles both old and new data structures.
  getUserProfile(userId: string): Observable<UserProfile | null> {
    const userRef = ref(this.db, `users/${userId}`);
    return objectVal<any>(userRef).pipe(
      map(userObject => {
        if (!userObject) {
          return null; // User does not exist.
        }
        // If 'profile' node exists and root lacks an email, it's the old structure.
        if (userObject.profile && !userObject.email) {
          return userObject.profile as UserProfile; // Return the nested profile data.
        }
        // Otherwise, it's the new, flat structure.
        return userObject as UserProfile;
      })
    );
  }

  // This function is designed to be called once upon login to migrate old data.
  async migrateUserProfileIfNeeded(userId: string): Promise<void> {
    const userRef = ref(this.db, `users/${userId}`);
    const snapshot = await get(userRef);
    const data = snapshot.val();

    // Migration is needed if 'profile' exists and there's no 'email' at the root.
    if (data && data.profile && !data.email) {
      console.log(`Old data structure detected for user ${userId}. Migrating...`);
      const profileData = data.profile; // The actual profile data to move.

      const updates: { [key: string]: any } = {};

      // 1. Copy all keys from the old 'profile' object to the root path.
      Object.keys(profileData).forEach(key => {
        updates[`/users/${userId}/${key}`] = profileData[key];
      });

      // 2. Mark the old 'profile' node for deletion in the same atomic update.
      updates[`/users/${userId}/profile`] = null;

      try {
        await update(ref(this.db), updates);
        console.log(`Migration successful for user ${userId}.`);
      } catch (error) {
        console.error(`Error migrating user ${userId}:`, error);
      }
    } 
  }

  createUserProfile(profile: UserProfile): Promise<void> {
    const userRef = ref(this.db, `users/${profile.uid}`);
    return set(userRef, profile);
  }

  updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
    const userRef = ref(this.db, `users/${userId}`);
    return update(userRef, data);
  }
}
