import { Injectable, inject } from '@angular/core';
import { Database, ref, set, get, child, onValue, objectVal, remove, update } from '@angular/fire/database';
import { Observable } from 'rxjs';

// Define a simple user profile interface for type safety
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  createdAt?: string;
  // Add any other user-specific data you want to store here
}

@Injectable({
  providedIn: 'root'
})
export class UserDataService {
  private db: Database = inject(Database);

  /**
   * Creates or updates a user profile in the Realtime Database.
   * The path will be `users/{uid}`.
   * @param userProfile The user profile object to save.
   * @returns A Promise that resolves when the data is set.
   */
  async createUserProfile(userProfile: UserProfile): Promise<void> {
    const userRef = ref(this.db, `users/${userProfile.uid}`);
    return set(userRef, userProfile);
  }

  /**
   * Retrieves a user profile by UID from the Realtime Database.
   * @param uid The user's UID.
   * @returns An Observable of the UserProfile or null if not found.
   */
  getUserProfile(uid: string): Observable<UserProfile | null> {
    const userRef = ref(this.db, `users/${uid}`);
    // objectVal() returns an Observable of the object at the given path
    return objectVal<UserProfile>(userRef);
  }

  /**
   * Updates specific fields of a user profile.
   * @param uid The user's UID.
   * @param data The partial data to update.
   * @returns A Promise that resolves when the data is updated.
   */
  async updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
    const userRef = ref(this.db, `users/${uid}`);
    return update(userRef, data);
  }

  /**
   * Deletes a user profile from the Realtime Database.
   * @param uid The user's UID.
   * @returns A Promise that resolves when the data is removed.
   */
  async deleteUserProfile(uid: string): Promise<void> {
    const userRef = ref(this.db, `users/${uid}`);
    return remove(userRef);
  }
}