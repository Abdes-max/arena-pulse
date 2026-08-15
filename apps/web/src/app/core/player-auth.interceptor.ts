import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { isSuperAdminScopedRequest } from '../super-admin/core/super-admin-scoped-request';
import { PlayerAuthService } from './player-auth.service';
import { isPlayerScopedRequest } from './player-scoped-request';

export const playerAuthInterceptor: HttpInterceptorFn = (req, next) => {
  // See the identical super-admin exclusion in admin/core/auth.interceptor.ts.
  if (!isPlayerScopedRequest(req.url) || isSuperAdminScopedRequest(req.url)) {
    return next(req);
  }
  const token = inject(PlayerAuthService).getAccessToken();
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
