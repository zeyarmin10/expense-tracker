// src/app/services/auth.ts
import { Injectable, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  AuthErrorCodes
} from '@angular/fire/auth';
import { TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { UserDataService, UserProfile } from './user-data';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private userDataService: UserDataService = inject(UserDataService);

  public get currentUserId(): string | null {
    return this.auth.currentUser ? this.auth.currentUser.uid : null;
  }

  currentUser$: Observable<User | null>;
  userProfile$: Observable<UserProfile | null>;

  private _logoutSuccess = new Subject<boolean>();
  logoutSuccess$: Observable<boolean> = this._logoutSuccess.asObservable();

  translateService = inject(TranslateService);

  constructor() {
    this.currentUser$ = new Observable<User | null>(observer => {
      onAuthStateChanged(this.auth, user => {
        observer.next(user);
      });
    });

    this.userProfile$ = this.currentUser$.pipe(
      switchMap(user => {
        if (user) {
          return this.userDataService.getUserProfile(user.uid);
        } else {
          return of(null);
        }
      })
    );
  }

  async register(email: string, password: string): Promise<User> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error: any) {
      if (error.code === AuthErrorCodes.EMAIL_EXISTS) {
        alert('ဒီအီးမေးလ်ကို စာရင်းသွင်းထားပြီးသားဖြစ်သည်။ အကောင့် Login ဝင်ကြည့်ပါ။');
      } else {
        alert(`Authentication error: ${error.message}`);
      }
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  async login(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error: any) {
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  async signInWithGoogle(): Promise<User> {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(this.auth, provider);
      return userCredential.user;
    } catch (error: any) {
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  /**
   * DEFINITIVE FIX: Logs out, cleans up storage, and notifies listeners in the correct order.
   * This is now the single source of truth for the entire logout process.
   */
  async logout(isManualLogout: boolean = false): Promise<void> {
    try {
      // 1. Sign out from Firebase first. This is crucial.
      // It triggers onAuthStateChanged, which will set the app's user state to null.
      await signOut(this.auth);

      // 2. ONLY AFTER signing out is complete, clear the local storage.
      // This completely eliminates the race condition where loginTime is null but the user is not.
      localStorage.removeItem('loginTime');
      localStorage.removeItem('lastActivityTime');

      // 3. Finally, notify all listeners that the logout (including all cleanup) is complete.
      this._logoutSuccess.next(isManualLogout);

    } catch (error: any) {
      console.error("Logout failed in AuthService:", error);
      // If Firebase fails, we don't clear local state. We just report the error.
      throw new Error(this.getFirebaseErrorMessage(error.code));
    }
  }

  public getFirebaseErrorMessage(error: any): string {
    if (error && typeof error.code === 'string') {
      switch (error.code) {
        case 'auth/email-already-in-use':
          return this.translateService.instant('EMAIL_ALREADY_IN_USE');
        case 'auth/invalid-email':
          return this.translateService.instant('INVALID_EMAIL');
        case 'auth/operation-not-allowed':
          return this.translateService.instant('OPERATION_NOT_ALLOWED');
        case 'auth/weak-password':
          return this.translateService.instant('WEAK_PASSWORD');
        case 'auth/user-disabled':
          return this.translateService.instant('USER_DISABLED');
        case 'auth/user-not-found':
          return this.translateService.instant('USER_NOT_FOUND');
        case 'auth/wrong-password':
          return this.translateService.instant('WRONG_PASSWORD');
        case 'auth/popup-closed-by-user':
          return this.translateService.instant('POPUP_CLOSED_BY_USER');
        case 'auth/cancelled-popup-request':
          return this.translateService.instant('CANCELLED_POPUP_REQUEST');
        case 'auth/network-request-failed':
          return this.translateService.instant('NETWORK_REQUEST_FAILED');
        case 'auth/invalid-credential':
          return this.translateService.instant('INVALID_CREDENTIAL');
        default:
          return this.translateService.instant('GENERIC', { code: error.code });
      }
    } else if (error && typeof error.message === 'string') {
      return `အမှားတစ်ခု ဖြစ်ပေါ်ခဲ့သည်: ${error.message}`;
    } else {
      return 'မမျှော်မှန်းထားသော ပြဿနာတစ်ခု ကြုံတွေ့နေရပါသည်။ ကျေးဇူးပြု၍ နောက်မှ ပြန်လည်ကြိုးစားပါ။';
    }
  }
}
