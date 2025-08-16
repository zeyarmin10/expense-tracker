// src/app/services/session-management.service.ts
import {
  Injectable,
  inject,
  forwardRef,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, timer, Subscription } from 'rxjs';
import { filter, tap, distinctUntilChanged, takeUntil } from 'rxjs/operators'; // Added takeUntil here
import { AuthService } from './auth';
import { User } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root',
})
export class SessionManagement implements OnDestroy {
  // Constants for session management
  //   private readonly SESSION_TIMEOUT_MS = 60 * 1000; // Testing: 1 minute for auto-logout
  private readonly SESSION_TIMEOUT_MS = 5 * 60 * 60 * 1000; // Production: 5 hours in milliseconds

  private readonly LAST_ACTIVITY_KEY = 'lastActivityTime';
  private readonly LOGIN_TIME_KEY = 'loginTime'; // Stores the initial login timestamp

  private sessionTimerSubscription: Subscription | null = null;
  private authService: AuthService;
  private authStateSubscription: Subscription; // To manage the currentUser$ subscription

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$: Observable<User | null> =
    this.currentUserSubject.asObservable();

  private router = inject(Router);
  private ngZone = inject(NgZone);

  constructor() {
    this.authService = inject(forwardRef(() => AuthService));

    window.addEventListener('storage', this.handleStorageChange);

    this.authStateSubscription = this.authService.currentUser$
      .pipe(
        distinctUntilChanged((prev, curr) => prev?.uid === curr?.uid),
        tap((user) => {
          this.currentUserSubject.next(user);
          if (user) {
            this.ensureLoginTimeSet(user);
            this.startSessionMonitoring();
          } else {
            this.stopSessionMonitoring(false);
          }
        })
      )
      .subscribe();

    // Modified: Subscribe to successful logout events and check the flag
    this.authService.logoutSuccess$.subscribe((isManualLogout: boolean) => {
      this.stopSessionMonitoring(true); // Always clear session keys on successful logout
      this.router.navigate(['/login']);

      if (!isManualLogout) {
        // Only show alert if it was NOT a manual logout
        alert(
          'သင်၏ session ကုန်ဆုံးသွားပြီဖြစ်သောကြောင့် အလိုအလျောက် ထွက်ခဲ့သည်။'
        );
      }
    });
  }

  ngOnDestroy(): void {
    this.stopSessionMonitoring(false); // Stop monitoring, but don't clear localStorage if app is just closing
    this.authStateSubscription.unsubscribe(); // Unsubscribe from authService.currentUser$
    window.removeEventListener('storage', this.handleStorageChange);
  }

  /**
   * Ensures that LOGIN_TIME_KEY is set when a user is logged in.
   * This should only be called when a session is *established*.
   * @param user The current User object, to confirm login state.
   */
  private ensureLoginTimeSet(user: User | null): void {
    if (user) {
      let storedLoginTime = localStorage.getItem(this.LOGIN_TIME_KEY);
      let parsedLoginTime = parseInt(storedLoginTime || '0', 10);

      // If no stored time, or time is invalid/zero, set it now.
      if (!storedLoginTime || isNaN(parsedLoginTime) || parsedLoginTime === 0) {
        const currentTime = Date.now();
        localStorage.setItem(this.LOGIN_TIME_KEY, currentTime.toString());
        // console.log('LOGIN_TIME_KEY set to:', new Date(currentTime).toLocaleTimeString());
      } else {
        // console.log('LOGIN_TIME_KEY already set to:', new Date(parsedLoginTime).toLocaleTimeString());
      }
      this.recordActivity();
    } else {
      // This path is less likely to be hit now, as logoutSuccess$ handles clearing.
      // But for robustness, if user is null, ensure it's cleared.
      localStorage.removeItem(this.LOGIN_TIME_KEY);
      localStorage.removeItem(this.LAST_ACTIVITY_KEY);
    }
  }

  /**
   * Records the current timestamp as the last activity time.
   * Call this on user interactions (e.g., mouse move, key press).
   */
  recordActivity(): void {
    if (this.currentUserSubject.getValue()) {
      localStorage.setItem(this.LAST_ACTIVITY_KEY, Date.now().toString());
    }
  }

  /**
   * Starts the session monitoring timer.
   * This should be called upon successful login or when an existing session is detected.
   */
  startSessionMonitoring(): void {
    this.stopSessionMonitoring(false); // Stop existing, but don't clear keys if they exist from a valid session

    this.ngZone.runOutsideAngular(() => {
      // The timer now starts with an initial delay to allow localStorage to be stable.
      // We check every 5 seconds.
      this.sessionTimerSubscription = timer(5000, 30 * 1000) //
        .pipe(
          filter(() => {
            // Re-check currentUser within the pipe to be absolutely sure we should proceed
            const user = this.currentUserSubject.getValue();
            if (!user) {
              //   console.log('User is null within timer, stopping monitoring via filter.');
              this.stopSessionMonitoring(true); // Ensure full cleanup if user becomes null unexpectedly
              return false;
            }
            return true;
          }),
          takeUntil(this.authService.currentUser$.pipe(filter((user) => !user)))
        )
        .subscribe(() => {
          this.ngZone.run(() => {
            this.checkSessionExpiration();
          });
        });
      //   console.log('Session monitoring started.');
    });
  }

  /**
   * Stops the session monitoring timer and optionally clears session-related localStorage items.
   * @param clearKeys If true, also clears LOGIN_TIME_KEY and LAST_ACTIVITY_KEY from localStorage.
   */
  stopSessionMonitoring(clearKeys: boolean): void {
    if (this.sessionTimerSubscription) {
      this.sessionTimerSubscription.unsubscribe();
      this.sessionTimerSubscription = null;
      //   console.log('Session monitoring stopped.');
    }
    if (clearKeys) {
      localStorage.removeItem(this.LAST_ACTIVITY_KEY);
      localStorage.removeItem(this.LOGIN_TIME_KEY);
      //   console.log('Session keys cleared from localStorage.');
    }
  }

  /**
   * Checks if the session has expired and logs out the user if it has.
   */
  private checkSessionExpiration(): void {
    const storedLoginTime = localStorage.getItem(this.LOGIN_TIME_KEY);
    const loginTime = parseInt(storedLoginTime || '0', 10); // Parse, default to 0 if null/undefined
    const currentUser = this.currentUserSubject.getValue();

    // Condition 1: Inconsistent state - user logged in, but no valid login time.
    if (currentUser && (isNaN(loginTime) || loginTime === 0)) {
      console.warn(
        'Inconsistent session state: User logged in but no valid LOGIN_TIME_KEY found. Forcing logout.'
      );
      this.logoutAndRedirect();
      return;
    }

    // Condition 2: No user or no valid login time - nothing to check.
    if (!currentUser || loginTime === 0) {
      return;
    }

    const currentTime = Date.now();
    const elapsedTimeSinceLogin = currentTime - loginTime;

    // console.log(
    //   `Checking session: LoginTime: ${new Date(
    //     loginTime
    //   ).toLocaleTimeString()}, CurrentTime: ${new Date(
    //     currentTime
    //   ).toLocaleTimeString()}, Elapsed: ${Math.floor(
    //     elapsedTimeSinceLogin / 1000
    //   )}s, Timeout: ${this.SESSION_TIMEOUT_MS / 1000}s`
    // );

    if (elapsedTimeSinceLogin >= this.SESSION_TIMEOUT_MS) {
      //   console.log('Session expired due to time limit. Logging out...');
      this.logoutAndRedirect();
    }
  }

  /**
   * Performs the logout by calling AuthService's logout method.
   * The actual session cleanup and navigation are handled by the logoutSuccess$ subscription.
   */
  async logoutAndRedirect(): Promise<void> {
    try {
      // This is an automatic logout, so set isManualLogout to false
      await this.authService.logout(false);
    } catch (error: any) {
      console.error('Error during automatic logout:', error);
      alert(
        `အလိုအလျောက် လော့အောက်လုပ်ရာတွင် ပြဿနာတခု ကြုံတွေ့နေရသည်: ${this.authService.getFirebaseErrorMessage(
          error
        )}`
      );
    }
  }

  /**
   * Handles storage changes from other tabs/windows to synchronize session state.
   */
  private handleStorageChange = (event: StorageEvent) => {
    // If LOGIN_TIME_KEY is cleared in another tab (e.g., by manual logout)
    if (event.key === this.LOGIN_TIME_KEY && event.newValue === null) {
      if (this.currentUserSubject.getValue()) {
        // console.log('LOGIN_TIME_KEY cleared in another tab. Forcing logout in this tab.');
        this.logoutAndRedirect(); // This will trigger cleanup via logoutSuccess$
      }
    } else if (event.key === this.LOGIN_TIME_KEY && event.newValue !== null) {
      // If LOGIN_TIME_KEY is set/updated in another tab (e.g., new login elsewhere)
      const newLoginTime = parseInt(event.newValue, 10);
      const currentLoginTime = parseInt(
        localStorage.getItem(this.LOGIN_TIME_KEY) || '0',
        10
      );

      // Only react if the new time is truly newer and a user is present
      if (
        !isNaN(newLoginTime) &&
        newLoginTime > currentLoginTime &&
        this.currentUserSubject.getValue()
      ) {
        // console.log('LOGIN_TIME_KEY updated in another tab. Restarting monitoring.');
        this.ensureLoginTimeSet(this.currentUserSubject.getValue()); // Re-evaluate based on current state
        this.startSessionMonitoring(); // Restart timer based on new/updated login time
      }
    }
  };
}
