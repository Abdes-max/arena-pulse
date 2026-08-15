import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SuperAdminAuthService } from './super-admin-auth.service';

export const superAdminAuthGuard: CanActivateFn = (_route, state) => {
  const superAdminAuthService = inject(SuperAdminAuthService);
  if (superAdminAuthService.isAuthenticated()) {
    return true;
  }
  const router = inject(Router);
  return router.createUrlTree(['/super-admin/login'], { queryParams: { returnUrl: state.url } });
};
