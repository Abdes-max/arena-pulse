import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OrganizerAuthService } from './auth.service';

// Same pattern as apps/web/src/app/admin/core/auth.guard.ts, redirecting to
// this app's own /organizer/login instead of web's /login.
export const organizerAuthGuard: CanActivateFn = (_route, state) => {
  const auth = inject(OrganizerAuthService);
  if (auth.isAuthenticated()) {
    return true;
  }
  const router = inject(Router);
  return router.createUrlTree(['/organizer/login'], { queryParams: { returnUrl: state.url } });
};
