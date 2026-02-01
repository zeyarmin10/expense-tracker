import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';
import { UserDataService, UserProfile } from '../services/user-data';
import { map, take, switchMap, of, from } from 'rxjs';

export const AuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state) => {
  const authService = inject(AuthService);
  const userDataService = inject(UserDataService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1),
    switchMap(user => {
      if (!user) {
        router.navigate(['/login']);
        return of(false);
      }

      return from(userDataService.getUserProfile(user.uid)).pipe(
        map((userProfile: UserProfile | null) => {
          const requiredPermissions = route.data?.['permissions'];

          if (!requiredPermissions) {
            return true; // No specific permissions required, allow access
          }

          if (!userProfile || !userProfile.permissions) {
            router.navigate(['/unauthorized']); // No profile or permissions, deny access
            return false;
          }

          const hasAllPermissions = Object.keys(requiredPermissions).every(key => {
            return userProfile.permissions?.[key as keyof typeof userProfile.permissions] === requiredPermissions[key];
          });

          if (hasAllPermissions) {
            return true; // User has all required permissions
          } else {
            router.navigate(['/unauthorized']); // Or a more appropriate route
            return false;
          }
        })
      );
    })
  );
};