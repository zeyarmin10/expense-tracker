import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from, map, switchMap, take } from 'rxjs';
import { AuthService } from '../services/auth';
import { GroupOfflineAccessService } from '../services/group-offline-access.service';

/** Prevents the standalone onboarding route from bypassing an expired group lease. */
export const GroupOfflineAccessGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const groupOfflineAccess = inject(GroupOfflineAccessService);
  const router = inject(Router);

  return auth.userProfile$.pipe(
    take(1),
    switchMap(profile => from(groupOfflineAccess.evaluate(profile))),
    map(state => state?.isLocked ? router.createUrlTree(['/dashboard']) : true),
  );
};
