import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { PlayerAuthService } from './player-auth.service';
import { isPlayerScopedRequest } from './player-scoped-request';

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
