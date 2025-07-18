import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, take } from 'rxjs/operators';

export const AuthGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1), // Take the first value emitted by currentUser$ and complete
    map(user => {
      if (user) {
        return true; // User is logged in, allow access
      } else {
        router.navigate(['/login']); // User is not logged in, redirect to login
        return false;
      }
    })
  );
};