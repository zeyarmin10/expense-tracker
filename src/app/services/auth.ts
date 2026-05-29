import { Injectable, inject, Injector } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  AuthErrorCodes,
  getAdditionalUserInfo,
  getRedirectResult,
  deleteUser,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from '@angular/fire/auth';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of, from, firstValueFrom, shareReplay } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { UserDataService, UserProfile } from './user-data';
import { GroupService } from './group.service';
import { SessionManagementService } from './session-management';
import { SpaceContextService } from './space-context.service';
import Swal from 'sweetalert2';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private isGoogleAuthInitialized = false;
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
    this.currentUser$ = new Observable<User | null>((observer) => {
      return onAuthStateChanged(this.auth, (user) => {
        observer.next(user);
      }, (error) => observer.error(error));
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    this.userProfile$ = this.currentUser$.pipe(
      switchMap((user) => {
        if (!user) {
          return of(null);
        }
        const userDataService = this.injector.get(UserDataService);
        const groupService = this.injector.get(GroupService);
        const spaceContextService = this.injector.get(SpaceContextService);

        return userDataService.getUserProfile(user.uid).pipe(
          switchMap((profile) => {
            if (!profile) {
              return of(null);
            }
            const activeSpaceId = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || null;

            if (!activeSpaceId) {
              return of({
                ...profile,
                accountType: profile.accountType || 'personal',
                groupId: profile.groupId || null,
              } as UserProfile);
            }

            return spaceContextService.getSpace(activeSpaceId).pipe(
              switchMap((space) => {
                if (!space) {
                  return of(profile);
                }

                if (space.type === 'group') {
                  return groupService.getGroupSettings(activeSpaceId).pipe(
                    map((groupSettings) =>
                      ({
                        ...profile,
                        currentSpaceId: activeSpaceId,
                        currentSpaceType: 'group',
                        currentSpaceName: space.name,
                        currentSpaceRole:
                          profile.spaceMemberships?.[activeSpaceId] ||
                          (profile.roles?.[activeSpaceId] as UserProfile['currentSpaceRole']) ||
                          'member',
                        accountType: 'group',
                        groupId: activeSpaceId,
                        currency: groupSettings?.currency || profile.currency,
                        budgetPeriod: (groupSettings?.budgetPeriod ||
                          null) as UserProfile['budgetPeriod'],
                        budgetStartDate: groupSettings?.budgetStartDate || null,
                        budgetEndDate: groupSettings?.budgetEndDate || null,
                        selectedBudgetPeriodId:
                          groupSettings?.selectedBudgetPeriodId || null,
                      }) as UserProfile,
                    ),
                  );
                }

                return of({
                  ...profile,
                  currentSpaceId: activeSpaceId,
                  currentSpaceType: 'personal',
                  currentSpaceName: space.name,
                  currentSpaceRole:
                    profile.spaceMemberships?.[activeSpaceId] || 'owner',
                  accountType: 'personal',
                  groupId: null,
                } as UserProfile);
              }),
            );
          }),
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  async register(email: string, password: string): Promise<User> {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password,
      );
      this.newUserRegisteredSource.next(userCredential.user.uid);
      await this.handleInvite(userCredential.user);
      return userCredential.user;
    } catch (error: any) {
      const errorMessage = this.getFirebaseErrorMessage(error);
      Swal.fire({
        icon: 'error',
        title: this.translateService.instant('AUTH_ERROR_TITLE'),
        text: errorMessage,
      });
      throw new Error(errorMessage);
    }
  }

  async login(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        email,
        password,
      );
      await this.handleInvite(userCredential.user);
      this.setLoginTime();
      return userCredential.user;
    } catch (error: any) {
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  async signInWithGoogle(): Promise<User> {
    try {
      if (Capacitor.isNativePlatform()) {
        // ── Android Native Google Sign-In ──

        // ✅ initialize() ကို တစ်ကြိမ်တည်းသာ ခေါ်ပါ — ထပ်ခေါ်ရင် crash ဖြစ်တယ်
        if (!this.isGoogleAuthInitialized) {
          await GoogleAuth.initialize({
            clientId:
              '114245767214-70122qvh2g7qor3cc4udhghkk4h2s179.apps.googleusercontent.com',
            scopes: ['profile', 'email'],
            grantOfflineAccess: true,
          });
          this.isGoogleAuthInitialized = true;
        }

        // ✅ signOut ကို initialize ပြီးမှသာ ခေါ်ပါ — account chooser အမြဲပေါ်မယ်
        try {
          await GoogleAuth.signOut();
        } catch (e) {
          // signIn မလုပ်ရသေးရင် signOut error ဖြစ်နိုင်တယ် — skip
        }

        const googleUser = await GoogleAuth.signIn();
        const idToken = googleUser.authentication.idToken;

        if (!idToken) {
          throw new Error('Google Sign-In failed: No ID token');
        }

        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(
          this.auth,
          credential,
        );

        const additionalUserInfo = getAdditionalUserInfo(userCredential);
        if (additionalUserInfo?.isNewUser) {
          this.newUserRegisteredSource.next(userCredential.user.uid);
        }

        this.setLoginTime();
        await this.handleInvite(userCredential.user);
        return userCredential.user;
      } else {
        // ── Web Popup — account chooser အမြဲပေါ်အောင် ──
        const provider = new GoogleAuthProvider();
        // ✅ prompt: 'select_account' ထည့်ရင် account chooser အမြဲပေါ်တယ်
        provider.setCustomParameters({ prompt: 'select_account' });
        const userCredential = await signInWithPopup(this.auth, provider);

        const additionalUserInfo = getAdditionalUserInfo(userCredential);
        if (additionalUserInfo?.isNewUser) {
          this.newUserRegisteredSource.next(userCredential.user.uid);
        }

        this.setLoginTime();
        await this.handleInvite(userCredential.user);
        return userCredential.user;
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  private setLoginTime() {
    const sessionManagementService = this.injector.get(
      SessionManagementService,
    );
    const now = new Date().getTime();
    localStorage.setItem('loginTime', now.toString());
    sessionManagementService.startSessionMonitoring();
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
          const existingProfile = await firstValueFrom(
            userDataService.getUserProfile(user.uid),
          );
          await this.db
            .object(`group_members/${inviteData.groupId}/${user.uid}`)
            .set({ role: role });
          await this.db
            .object(`space_members/${inviteData.groupId}/${user.uid}`)
            .set({ role: role });

          const nextProfile: Partial<UserProfile> = {
            accountType: 'group',
            currentSpaceId: inviteData.groupId,
            currentSpaceType: 'group',
            roles: {
              ...(existingProfile?.roles || {}),
              [inviteData.groupId]: role,
            },
            spaceMemberships: {
              ...(existingProfile?.spaceMemberships || {}),
              [inviteData.groupId]: role,
            },
          };

          if (!existingProfile?.groupId) {
            nextProfile.groupId = inviteData.groupId;
          }

          await userDataService.updateUserProfile(user.uid, {
            ...nextProfile,
          });

          try {
            await inviteRef.update({
              status: 'accepted',
              acceptedBy: user.uid,
              acceptedAt: new Date().toISOString(),
            });
          } catch (error) {
            console.warn(
              'Invitation status could not be updated, but the user has been successfully added to the group. This may be due to database security rules, and this warning can likely be ignored.',
              error,
            );
          }
        }
      }
    }
  }

  async logout(isManualLogout: boolean = false): Promise<void> {
    const sessionManagementService = this.injector.get(
      SessionManagementService,
    );
    try {
      // ✅ Native မှာ Google session ပါ clear လုပ်ပါ
      // ဒါမှ နောက်တကြိမ် Sign in with Google နှိပ်ရင် account chooser ပြမယ်
      if (Capacitor.isNativePlatform()) {
        // ✅ initialize ဖြစ်ပြီးမှသာ GoogleAuth.signOut() ခေါ်ပါ
        if (this.isGoogleAuthInitialized) {
          try {
            await GoogleAuth.signOut();
          } catch (e) {
            console.warn('GoogleAuth signOut error:', e);
          }
        }
      }

      await signOut(this.auth);
      localStorage.removeItem('loginTime');
      localStorage.removeItem('lastActivityTime');
      sessionManagementService.stopSessionMonitoring();
      this._logoutSuccess.next(isManualLogout);
    } catch (error: any) {
      console.error('Logout failed in AuthService:', error);
      throw new Error(this.getFirebaseErrorMessage(error.code));
    }
  }

  async deleteAccount(password?: string): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) throw new Error('No authenticated user');

    const uid = currentUser.uid;
    const userDataService = this.injector.get(UserDataService);
    const groupService = this.injector.get(GroupService);

    const profile = await firstValueFrom(userDataService.getUserProfile(uid));
    if (!profile) throw new Error('User profile not found');

    const personalSpaceId = profile.personalSpaceId;
    const allMemberships = { ...(profile.spaceMemberships || {}), ...(profile.roles || {}) };
    const groupIds = Object.keys(allMemberships).filter(id => id !== personalSpaceId);

    // Block deletion if user owns a group that still has other members
    for (const groupId of groupIds) {
      const role = allMemberships[groupId];
      if (role === 'owner' || role === 'admin') {
        const memberSnap = await this.db.database.ref(`group_members/${groupId}`).get();
        if (memberSnap.exists()) {
          const otherMembers = Object.keys(memberSnap.val() || {}).filter(id => id !== uid);
          if (otherMembers.length > 0) {
            const groupSnap = await this.db.database.ref(`groups/${groupId}/groupName`).get();
            const groupName = groupSnap.exists() ? groupSnap.val() : '';
            throw new Error(`HAS_MEMBERS:${groupName}`);
          }
        }
      }
    }

    // Re-authenticate before any deletion
    const providerId = currentUser.providerData[0]?.providerId;

    if (providerId === 'google.com') {
      if (Capacitor.isNativePlatform()) {
        if (!this.isGoogleAuthInitialized) {
          await GoogleAuth.initialize({
            clientId: '114245767214-70122qvh2g7qor3cc4udhghkk4h2s179.apps.googleusercontent.com',
            scopes: ['profile', 'email'],
            grantOfflineAccess: true,
          });
          this.isGoogleAuthInitialized = true;
        }
        try { await GoogleAuth.signOut(); } catch {}
        const googleUser = await GoogleAuth.signIn();
        const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
        await reauthenticateWithCredential(currentUser, credential);
      } else {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await reauthenticateWithPopup(currentUser, provider);
      }
    } else if (providerId === 'password') {
      if (!password) throw new Error('Password required for re-authentication');
      const credential = EmailAuthProvider.credential(currentUser.email!, password);
      await reauthenticateWithCredential(currentUser, credential);
    }

    // Remove from all groups / delete owned groups
    for (const groupId of groupIds) {
      const role = allMemberships[groupId];
      if (role === 'owner' || role === 'admin') {
        // Auto-revoke pending invitations so deleteGroup won't block
        const inviteSnap = await this.db.database.ref('invitations')
          .orderByChild('groupId').equalTo(groupId).get();
        if (inviteSnap.exists()) {
          const invitations = inviteSnap.val() as Record<string, any>;
          await Promise.all(
            Object.entries(invitations)
              .filter(([, inv]) => (inv as any)?.status === 'pending')
              .map(([inviteId]) => this.db.database.ref(`invitations/${inviteId}`).remove()),
          );
        }
        await groupService.deleteGroup(groupId, uid);
      } else {
        await groupService.removeMember(groupId, uid);
      }
    }

    // Clean up personal space data
    if (personalSpaceId) {
      await Promise.all([
        this.db.database.ref(`group_data/${personalSpaceId}`).remove(),
        this.db.database.ref(`spaces/${personalSpaceId}`).remove(),
        this.db.database.ref(`space_members/${personalSpaceId}`).remove(),
      ]);
    }

    // Delete user profile node
    await userDataService.deleteUserData(uid);

    // Delete Firebase Auth account
    await deleteUser(currentUser);

    localStorage.removeItem('loginTime');
    localStorage.removeItem('lastActivityTime');
    this._logoutSuccess.next(true);
  }

  public getFirebaseErrorMessage(error: any): string {
    if (error && typeof error.code === 'string') {
      switch (error.code) {
        case AuthErrorCodes.EMAIL_EXISTS:
          return this.translateService.instant('AUTH_EMAIL_EXISTS_ERROR');
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
      return this.translateService.instant('AUTH_GENERIC_MESSAGE_ERROR', {
        message: error.message,
      });
    } else {
      return this.translateService.instant('AUTH_UNEXPECTED_ERROR');
    }
  }
}
