// src/app/services/auth.ts
import { Injectable, inject, Injector } from '@angular/core';
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
import { switchMap, map } from 'rxjs/operators';
import { UserDataService, UserProfile } from './user-data';
import { GroupService } from './group.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
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

  constructor(private injector: Injector) {
    this.currentUser$ = new Observable<User | null>(observer => {
      onAuthStateChanged(this.auth, user => {
        observer.next(user);
      });
    });

    this.userProfile$ = this.currentUser$.pipe(
      switchMap(user => {
        if (!user) {
          return of(null);
        }
        // LAZY INJECT services here to break circular dependency
        const userDataService = this.injector.get(UserDataService);
        const groupService = this.injector.get(GroupService);

        return userDataService.getUserProfile(user.uid).pipe(
          switchMap(profile => {
            if (!profile) {
              return of(null);
            }
            if (profile.groupId) {
              return groupService.getGroupSettings(profile.groupId).pipe(
                map(groupSettings => {
                  if (groupSettings) {
                    return {
                      ...profile,
                      currency: groupSettings.currency || profile.currency,
                      budgetPeriod: (groupSettings.budgetPeriod as UserProfile['budgetPeriod']) || profile.budgetPeriod,
                      budgetStartDate: groupSettings.budgetStartDate || profile.budgetStartDate,
                      budgetEndDate: groupSettings.budgetEndDate || profile.budgetEndDate,
                      selectedBudgetPeriodId: groupSettings.selectedBudgetPeriodId || profile.selectedBudgetPeriodId
                    };
                  } else {
                    return profile;
                  }
                })
              );
            } else {
              return of(profile);
            }
          })
        );
      })
    );
  }

  async register(email: string, password: string): Promise<User> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
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
        this.newUserRegisteredSource.next(userCredential.user.uid);
      }

      await this.handleInvite(userCredential.user);
      return userCredential.user;
    } catch (error: any) {
      console.error('Google sign-in error:', error);
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
          const userDataService = this.injector.get(UserDataService);
          const role = 'member';
          await this.db.object(`group_members/${inviteData.groupId}/${user.uid}`).set({ role: role });

          await userDataService.updateUserProfile(user.uid, {
            groupId: inviteData.groupId,
            accountType: 'group',
            roles: { [inviteData.groupId]: role }
          });

          try {
            await inviteRef.update({
              status: 'accepted',
              acceptedBy: user.uid,
              acceptedAt: new Date().toISOString()
            });
          } catch (error) {
            console.warn('Invitation status could not be updated, but the user has been successfully added to the group. This may be due to database security rules, and this warning can likely be ignored.', error);
          }
        }
      }
    }
  }

  async logout(isManualLogout: boolean = false): Promise<void> {
    try {
      await signOut(this.auth);
      localStorage.removeItem('loginTime');
      localStorage.removeItem('lastActivityTime');
      this._logoutSuccess.next(isManualLogout);
    } catch (error: any) {
      console.error("Logout failed in AuthService:", error);
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
