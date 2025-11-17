import { Component, signal, inject, HostListener, ElementRef } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth';
import { Observable, of, Subject, takeUntil, debounceTime, from } from 'rxjs'; // Import 'from'
import { User } from '@angular/fire/auth';
import { CommonModule } from '@angular/common';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { UserDataService, UserProfile } from './services/user-data'; // Import UserDataService and UserProfile
import { switchMap, map } from 'rxjs/operators'; // Import operators
import { Toast } from './components/toast/toast';
import { SessionManagement } from './services/session-management';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CommonModule,
    TranslateModule,
    Toast
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('expense-tracker');
  authService = inject(AuthService);
  userDataService = inject(UserDataService); // Inject UserDataService
  currentUser$: Observable<User | null> = this.authService.currentUser$; // Expose current user observable
  router = inject(Router);
  translateService = inject(TranslateService);

  // NEW: Observable to get the display name from UserProfile or Firebase User
  userDisplayName$: Observable<string | null>;

  private sessionService = inject(SessionManagement);
  private destroy$ = new Subject<void>();
  private activitySubject = new Subject<void>();


  constructor(private elementRef: ElementRef) {
    // Set default language and add languages
    this.translateService.addLangs(['my', 'en']);
    this.translateService.setDefaultLang('my');

    // Force use 'my' as the initial language
    this.translateService.use('my');

    // Initialize userDisplayName$
    this.userDisplayName$ = this.currentUser$.pipe(
      switchMap(user => {
        if (user) {
          // If a Firebase user exists, get their profile from UserDataService
          return from(this.userDataService.getUserProfile(user.uid)).pipe(
            map(userProfile => {
              // Prioritize displayName from UserProfile, otherwise use Firebase displayName or email
              return userProfile?.displayName || user.displayName || user.email;
            })
          );
        } else {
          // No user logged in
          return of(null);
        }
      })
    );
  }

  ngOnInit(): void {
    // Listen for global activity events to record activity
    this.activitySubject.pipe(
      debounceTime(5000), // Debounce activity to avoid excessive updates (e.g., every 5 seconds)
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.sessionService.recordActivity(); // Record activity on user interaction
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Listen for common user interactions
  @HostListener('document:mousemove')
  @HostListener('document:keypress')
  @HostListener('document:click')
  onActivity(): void {
    this.activitySubject.next();
  }

  async logout(): Promise<void> { // This method would be tied to your "Logout" button
    try {
      await this.authService.logout(true); // Pass true for manual logout
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  closeNavbarMenu(): void {
    const navbarToggler = this.elementRef.nativeElement.querySelector('.navbar-toggler');
    if (navbarToggler && window.getComputedStyle(navbarToggler).display !== 'none') {
        navbarToggler.click();
    }
  }
}
