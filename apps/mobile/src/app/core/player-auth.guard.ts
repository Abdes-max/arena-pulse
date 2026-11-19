import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlayerAuthService } from './player-auth.service';

/** Team manager pages: signed in, or a stored session restored, else the manager login (back here afterwards). */
export const playerAuthGuard: CanActivateFn = async (_route, state) => {
  // Both injected before the await: inject() only works synchronously, in
  // the guard's injection context -- calling it after the await threw, and
  // the navigation was silently cancelled (nothing happened on tap).
  const auth = inject(PlayerAuthService);
  const router = inject(Router);
  if (auth.isAuthenticated() || (await auth.silentRefresh())) {
    return true;
  }
  return router.createUrlTree(['/espace-responsable/connexion'], {
    queryParams: { returnUrl: state.url },
  });
};
