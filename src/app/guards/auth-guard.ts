import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, take } from 'rxjs/operators';

export const AuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1),
    map(user => {
      const isLoggedIn = !!user;
      const isAuthRoute = state.url.includes('/login') || state.url.includes('/register');

      if (isLoggedIn) {
        // If user is logged in and tries to access login/register page, redirect to dashboard
        if (isAuthRoute) {
          router.navigate(['/dashboard']);
          return false;
        }
        // If user is logged in and trying to access a protected route, allow access
        return true;
      } else {
        // If user is not logged in and tries to access a protected route, redirect to login
        if (!isAuthRoute) {
          router.navigate(['/login']);
          return false;
        }
        // If user is not logged in and is on login/register page, allow access
        return true;
      }
    })
  );
};
