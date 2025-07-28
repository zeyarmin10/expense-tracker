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
import { Observable, Subject } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);

  public get currentUserId(): string | null {
    return this.auth.currentUser ? this.auth.currentUser.uid : null;
  }

  currentUser$: Observable<User | null>;

  // New: Subject to emit when a logout successfully completes
  private _logoutSuccess = new Subject<boolean>();
  logoutSuccess$: Observable<boolean> = this._logoutSuccess.asObservable();

  translateService = inject(TranslateService);

  constructor() {
    this.currentUser$ = new Observable<User | null>(observer => {
      onAuthStateChanged(this.auth, user => {
        observer.next(user);
      });
    });
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
   * Logs out the current user.
   * @param isManualLogout True if this logout was triggered by a user's manual action.
   * @returns A Promise that resolves when logout is complete.
   * @throws Error on failure.
   */
  async logout(isManualLogout: boolean = false): Promise<void> { // Added isManualLogout parameter
    try {
      await signOut(this.auth);
      this._logoutSuccess.next(isManualLogout); // Emit with the flag
    } catch (error: any) {
      // You might still want to emit false on error, or handle errors differently
      // For now, we only emit on success.
      throw new Error(this.getFirebaseErrorMessage(error.code));
    }
  }

  public getFirebaseErrorMessage(error: any): string { // Made public for use in SessionManagementService
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