// src/app/app.ts
import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth';
import { Observable, of } from 'rxjs'; // Import 'of'
import { User } from '@angular/fire/auth';
import { CommonModule } from '@angular/common';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { UserDataService, UserProfile } from './services/user-data'; // Import UserDataService and UserProfile
import { switchMap, map } from 'rxjs/operators'; // Import operators
import { Toast } from './components/toast/toast';

@Component({
  selector: 'app-root',
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

  constructor() {
    // Set default language and add languages
    this.translateService.addLangs(['my', 'en']);
    this.translateService.setDefaultLang('my');

    // Force use 'my' as the initial language
    this.translateService.use('my');

    // Initialize userDisplayName$
    this.userDisplayName$ = this.currentUser$.pipe(
      switchMap(user => {
        if (user) {
          // If a Firebase user exists, try to get their profile from UserDataService
          return this.userDataService.getUserProfile(user.uid).pipe( //
            map(userProfile => {
              // Prioritize displayName from UserProfile, otherwise use Firebase displayName or email
              return userProfile?.displayName || user.displayName || user.email; //
            })
          );
        } else {
          // No user logged in
          return of(null);
        }
      })
    );
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']); // Redirect to login after logout
    } catch (error) {
      console.error('Logout failed:', error);
      // Handle error (e.g., show a toast notification)
    }
  }
}