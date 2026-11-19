import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { PlayerAuthService } from './player-auth.service';

/**
 * True for requests that carry the team manager's token rather than the
 * organizer's: player-auth itself, plus the /public endpoints of the
 * registrations (submit, own list and stats, club search) -- same boundary
 * as apps/web's player-scoped-request.ts.
 */
export function isPlayerScopedRequest(url: string): boolean {
  return (
    url.includes('/player-auth') || (url.includes('/public/') && url.includes('/registrations'))
  );
}

export const playerAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isPlayerScopedRequest(req.url)) {
    return next(req);
  }
  const token = inject(PlayerAuthService).getAccessToken();
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
