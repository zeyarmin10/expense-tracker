import {
  Injectable,
  inject,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, timer, Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { AuthService } from './auth';
import { User } from '@angular/fire/auth';
import Swal from 'sweetalert2';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root',
})
export class SessionManagementService implements OnDestroy {
  private readonly SESSION_TIMEOUT_MS = 1 * 60 * 1000; // 1 minute
  private readonly LAST_ACTIVITY_KEY = 'lastActivityTime';
  private readonly LOGIN_TIME_KEY = 'loginTime';

  private sessionTimerSubscription: Subscription | null = null;
  private authStateSubscription: Subscription;
  private logoutSuccessSubscription: Subscription;

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();

  private router = inject(Router);
  private ngZone = inject(NgZone);
  private translate = inject(TranslateService);

  constructor(private authService: AuthService) {
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

    this.logoutSuccessSubscription = this.authService.logoutSuccess$.subscribe((isManualLogout) => {
      this.router.navigate(['/login']);
      if (!isManualLogout) {
        Swal.fire({
          title: this.translate.instant('SESSION_EXPIRED_TITLE'),
          text: this.translate.instant('SESSION_EXPIRED_MESSAGE'),
          icon: 'warning',
          confirmButtonText: this.translate.instant('OK_BUTTON')
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.stopSessionMonitoring();
    this.authStateSubscription.unsubscribe();
    this.logoutSuccessSubscription.unsubscribe();
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
    
    if (loginTime > 0 && (Date.now() - loginTime >= this.SESSION_TIMEOUT_MS)) {
      this.logoutAndRedirect();
    }
  }

  async logoutAndRedirect(): Promise<void> {
    this.stopSessionMonitoring();
    try {
      await this.authService.logout(false);
    } catch (error) {
      console.error('Error during automatic logout:', error);
    }
  }

  private handleStorageChange = (event: StorageEvent) => {
    if (event.key === this.LOGIN_TIME_KEY && event.newValue === null) {
      if (this.currentUserSubject.getValue()) {
        this.router.navigate(['/login']);
      }
    }
  };
}
