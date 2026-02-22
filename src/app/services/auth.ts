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
  AuthErrorCodes,
  getAdditionalUserInfo
} from '@angular/fire/auth';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of, from, firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { UserDataService, UserProfile } from './user-data';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private userDataService: UserDataService = inject(UserDataService);
  private db: AngularFireDatabase = inject(AngularFireDatabase);

  public get currentUserId(): string | null {
    return this.auth.currentUser ? this.auth.currentUser.uid : null;
  }

  currentUser$: Observable<User | null>;
  userProfile$: Observable<UserProfile | null>;

  private _logoutSuccess = new Subject<boolean>();
  logoutSuccess$: Observable<boolean> = this._logoutSuccess.asObservable();

  private newUserRegisteredSource = new Subject<string>();
  newUserRegistered$ = this.newUserRegisteredSource.asObservable();

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
      // A new user has registered, notify listeners
      this.newUserRegisteredSource.next(userCredential.user.uid);
      await this.handleInvite(userCredential.user);
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
      await this.handleInvite(userCredential.user);
      return userCredential.user;
    } catch (error: any) {
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  async signInWithGoogle(): Promise<User> {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(this.auth, provider);
      const additionalUserInfo = getAdditionalUserInfo(userCredential);
      
      if (additionalUserInfo?.isNewUser) {
        // A new user has signed in with Google, notify listeners
        this.newUserRegisteredSource.next(userCredential.user.uid);
      }

      await this.handleInvite(userCredential.user);
      return userCredential.user;
    } catch (error: any) {
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  private async handleInvite(user: User): Promise<void> {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('invite_code');

    if (inviteCode) {
      const inviteRef = this.db.object(`invitations/${inviteCode}`);
      const inviteSnap = await inviteRef.query.get();

      if (inviteSnap.exists()) {
        const inviteData = inviteSnap.val();
        if (inviteData.status === 'pending') {
          const role = 'member'; // The role for a new member
          // Add user to the group with only their role
          await this.db.object(`group_members/${inviteData.groupId}/${user.uid}`).set({ role: role });

          // Update the user's profile
          await this.userDataService.updateUserProfile(user.uid, { 
            groupId: inviteData.groupId,
            accountType: 'group',
            roles: { [inviteData.groupId]: role } 
          });

          // Mark invitation as used
          await inviteRef.update({ 
            status: 'accepted', 
            acceptedBy: user.uid, 
            acceptedAt: new Date().toISOString() 
          });
        }
      }
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
