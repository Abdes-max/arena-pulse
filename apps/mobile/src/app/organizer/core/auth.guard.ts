import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OrganizerAuthService } from './auth.service';

// Same pattern as apps/web/src/app/admin/core/auth.guard.ts, redirecting to
// this app's own /organizer/login instead of web's /login.
// The opposite guard, for login/register/forgot-password: someone already
// signed in who comes back to "Connexion" (e.g. from the home screen's
// settings) lands on their tournaments instead of a pointless login form.
export const organizerGuestGuard: CanActivateFn = () => {
  if (!inject(OrganizerAuthService).isAuthenticated()) {
    return true;
  }
  return inject(Router).createUrlTree(['/organizer/tournaments']);
};

export const organizerAuthGuard: CanActivateFn = (_route, state) => {
  const auth = inject(OrganizerAuthService);
  if (auth.isAuthenticated()) {
    return true;
  }
  const router = inject(Router);
  return router.createUrlTree(['/organizer/login'], { queryParams: { returnUrl: state.url } });
};
