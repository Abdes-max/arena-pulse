import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { isPlayerScopedRequest } from '../../core/player-scoped-request';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Player-scoped requests get the PlayerAccount token instead (see
  // player-auth.interceptor.ts) -- skipped here so an organizer session
  // in the same browser never overrides it.
  if (isPlayerScopedRequest(req.url)) {
    return next(req);
  }
  const token = inject(AuthService).getAccessToken();
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
