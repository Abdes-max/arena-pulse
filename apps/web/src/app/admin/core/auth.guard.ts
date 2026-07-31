import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  if (authService.isAuthenticated()) {
    return true;
  }
  const router = inject(Router);
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
