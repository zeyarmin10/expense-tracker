import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { UserDataService } from '../services/user-data';
import { map, take, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

export const AuthGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const userDataService = inject(UserDataService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1),
    switchMap(user => {
      if (!user) {
        if (state.url.includes('/login') || state.url.includes('/register')) {
          return of(true);
        }
        router.navigate(['/login']);
        return of(false);
      }

      // For logged-in users, check their profile status
      return userDataService.getUserProfile(user.uid).pipe(
        take(1),
        map(profile => {
          const isOnboardingRoute = state.url.includes('/onboarding');

          if (!profile || !profile.accountType) {
            if (isOnboardingRoute) {
              return true; // Allow access to the onboarding page
            }
            router.navigate(['/onboarding']);
            return false; // Redirect to onboarding if profile is incomplete
          } else {
            if (isOnboardingRoute) {
              router.navigate(['/dashboard']);
              return false; // Already onboarded, redirect from onboarding page
            }
            return true; // Profile is complete, allow access to the requested route
          }
        })
      );
    })
  );
};
