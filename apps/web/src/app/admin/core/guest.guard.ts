import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isSafeReturnUrl } from '../../core/safe-return-url.util';
import { AuthService } from './auth.service';

/**
 * Login / sign-up pages: an organizer whose session is already open (restored
 * from the refresh cookie at startup) goes straight to their space instead.
 */
export const guestGuard: CanActivateFn = (route) => {
  if (!inject(AuthService).isAuthenticated()) {
    return true;
  }
  const returnUrl = route.queryParamMap.get('returnUrl');
  return inject(Router).parseUrl(
    isSafeReturnUrl(returnUrl) ? returnUrl : inject(AuthService).homeUrl(),
  );
};
