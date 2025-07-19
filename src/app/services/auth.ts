import { Injectable, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User,
  onAuthStateChanged,
  GoogleAuthProvider, // Import GoogleAuthProvider
  signInWithPopup, // Import signInWithPopup
  AuthErrorCodes
} from '@angular/fire/auth';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);

  public get currentUserId(): string | null {
    return this.auth.currentUser ? this.auth.currentUser.uid : null;
  }
  
  currentUser$: Observable<User | null>;

  constructor() {
    // Observable to track the current authentication state
    this.currentUser$ = new Observable<User | null>(observer => {
      onAuthStateChanged(this.auth, user => {
        observer.next(user);
      });
    });
  }

  /**
   * Registers a new user with email and password.
   * @param email User's email
   * @param password User's password
   * @returns A Promise that resolves with the User object on success.
   * @throws Error with a user-friendly message on failure.
   */
  async register(email: string, password: string): Promise<User> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error: any) {
        if (error.code === AuthErrorCodes.EMAIL_EXISTS) {
            alert('This email is already registered. Try logging in instead.');
        } else {
            alert(`Authentication error: ${error.message}`);
        }
      throw new Error(this.getFirebaseErrorMessage(error.code));
    }
  }

  /**
   * Logs in an existing user with email and password.
   * @param email User's email
   * @param password User's password
   * @returns A Promise that resolves with the User object on success.
   * @throws Error with a user-friendly message on failure.
   */
  async login(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error: any) {
      throw new Error(this.getFirebaseErrorMessage(error.code));
    }
  }

  /**
   * Signs in with Google using a popup.
   * @returns A Promise that resolves with the User object on success.
   * @throws Error with a user-friendly message on failure.
   */
  async signInWithGoogle(): Promise<User> {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(this.auth, provider);
      return userCredential.user;
    } catch (error: any) {
      // Handle specific Google auth errors if needed
      throw new Error(this.getFirebaseErrorMessage(error.code));
    }
  }

  /**
   * Logs out the current user.
   * @returns A Promise that resolves when logout is complete.
   * @throws Error on failure.
   */
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error: any) {
      throw new Error(this.getFirebaseErrorMessage(error.code));
    }
  }

  /**
   * Helper to get more user-friendly Firebase authentication error messages.
   */
  private getFirebaseErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return 'This email address is already in use.';
      case 'auth/invalid-email':
        return 'The email address is not valid.';
      case 'auth/operation-not-allowed':
        return 'Email/password sign-in is not enabled. Please check Firebase settings.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/user-disabled':
        return 'This user account has been disabled.';
      case 'auth/user-not-found':
        return 'No user found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in popup was closed.';
      case 'auth/cancelled-popup-request':
        return 'Google sign-in popup was already open.';
      default:
        return `An unknown authentication error occurred: ${errorCode}`;
    }
  }
}