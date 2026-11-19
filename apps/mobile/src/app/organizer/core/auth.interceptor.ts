import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { isPlayerScopedRequest } from '../../core/player-auth.interceptor';
import { OrganizerAuthService } from './auth.service';

// The team manager's requests (player-auth, registrations) carry their own
// token (playerAuthInterceptor) -- never the organizer's. The public endpoints
// PublicApiService calls are all @Public() server-side and ignore the
// Authorization header entirely, so attaching it unconditionally is harmless.
export const organizerAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (isPlayerScopedRequest(req.url)) {
    return next(req);
  }
  const token = inject(OrganizerAuthService).getAccessToken();
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
