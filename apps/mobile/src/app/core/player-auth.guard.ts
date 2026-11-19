import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlayerAuthService } from './player-auth.service';

/** Team manager pages: signed in, or a stored session restored, else the manager login (back here afterwards). */
export const playerAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(PlayerAuthService);
  if (auth.isAuthenticated() || (await auth.silentRefresh())) {
    return true;
  }
  return inject(Router).createUrlTree(['/espace-responsable/connexion'], {
    queryParams: { returnUrl: state.url },
  });
};
