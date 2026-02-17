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
import { distinctUntilChanged } from 'rxjs/operators';
import { AuthService } from './auth';
import { User } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root',
})
export class SessionManagement implements OnDestroy {
  private readonly SESSION_TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 hours
  private readonly LAST_ACTIVITY_KEY = 'lastActivityTime';
  private readonly LOGIN_TIME_KEY = 'loginTime';

  private sessionTimerSubscription: Subscription | null = null;
  private authService: AuthService;
  private authStateSubscription: Subscription;
  private logoutSuccessSubscription: Subscription;

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();

  private router = inject(Router);
  private ngZone = inject(NgZone);

  constructor() {
    this.authService = inject(forwardRef(() => AuthService));
    window.addEventListener('storage', this.handleStorageChange);

    this.authStateSubscription = this.authService.currentUser$
      .pipe(distinctUntilChanged((prev, curr) => prev?.uid === curr?.uid))
      .subscribe((user) => {
        this.currentUserSubject.next(user);
        if (user) {
          this.ensureLoginTimeSet();
          this.startSessionMonitoring();
        } else {
          this.stopSessionMonitoring();
        }
      });

    // This is now the single source of truth for handling post-logout UI.
    this.logoutSuccessSubscription = this.authService.logoutSuccess$.subscribe((isManualLogout) => {
      this.router.navigate(['/login']);
      if (!isManualLogout) {
        alert('သင်၏ session ကုန်ဆုံးသွားပြီဖြစ်သောကြောင့် အလိုအလျောက် ထွက်ခဲ့သည်။');
      }
    });
  }

  ngOnDestroy(): void {
    this.stopSessionMonitoring();
    this.authStateSubscription?.unsubscribe();
    this.logoutSuccessSubscription?.unsubscribe();
    window.removeEventListener('storage', this.handleStorageChange);
  }

  private ensureLoginTimeSet(): void {
    if (!localStorage.getItem(this.LOGIN_TIME_KEY)) {
      localStorage.setItem(this.LOGIN_TIME_KEY, Date.now().toString());
      this.recordActivity();
    }
  }

  recordActivity(): void {
    localStorage.setItem(this.LAST_ACTIVITY_KEY, Date.now().toString());
  }

  startSessionMonitoring(): void {
    this.stopSessionMonitoring(); // Prevent duplicate timers
    this.ngZone.runOutsideAngular(() => {
      this.sessionTimerSubscription = timer(5000, 30 * 1000).subscribe(() => {
        this.ngZone.run(() => this.checkSessionExpiration());
      });
    });
  }

  stopSessionMonitoring(): void {
    this.sessionTimerSubscription?.unsubscribe();
    this.sessionTimerSubscription = null;
  }

  private checkSessionExpiration(): void {
    const loginTime = parseInt(localStorage.getItem(this.LOGIN_TIME_KEY) || '0', 10);
    
    // With the root cause fixed in auth.ts, we only need to check the time.
    // No user check is needed, as loginTime will be cleared reliably.
    if (loginTime > 0 && (Date.now() - loginTime >= this.SESSION_TIMEOUT_MS)) {
      this.logoutAndRedirect();
    }
  }

  // Triggers an automatic logout.
  async logoutAndRedirect(): Promise<void> {
    try {
      await this.authService.logout(false); // Call with 'false' for automatic
    } catch (error) {
      console.error('Error during automatic logout:', error);
    }
  }

  // Handles logout from another tab.
  private handleStorageChange = (event: StorageEvent) => {
    if (event.key === this.LOGIN_TIME_KEY && event.newValue === null) {
      if (this.currentUserSubject.getValue()) {
        // The authStateSubscription will handle the user becoming null.
        // We just need to ensure navigation happens, as logoutSuccess event won't fire in this tab.
        this.router.navigate(['/login']);
      }
    }
  };
}
