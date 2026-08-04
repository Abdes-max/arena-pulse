import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlayerAuthService } from './player-auth.service';

export const playerAuthGuard: CanActivateFn = (_route, state) => {
  const playerAuthService = inject(PlayerAuthService);
  if (playerAuthService.isAuthenticated()) {
    return true;
  }
  const router = inject(Router);
  return router.createUrlTree(['/player/login'], { queryParams: { returnUrl: state.url } });
};
