import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * The admin needs an organization: an account without one (a team
 * manager's) is offered to create it first.
 */
export const organizationGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  return authService.organizations().length > 0
    ? true
    : inject(Router).createUrlTree(['/organiser']);
};
