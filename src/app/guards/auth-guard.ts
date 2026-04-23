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
          if (!profile) {
            router.navigate(['/login']);
            return false;
          }

          return true;
        })
      );
    })
  );
};
