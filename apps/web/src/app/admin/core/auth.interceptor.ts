import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { isSuperAdminScopedRequest } from '../../super-admin/core/super-admin-scoped-request';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Super-admin-scoped requests get their own token instead (see
  // super-admin-auth.interceptor.ts) -- skipped here so an organizer session
  // in the same browser never overrides it. One account for organizers and
  // team managers: the registrations carry this token.
  if (isSuperAdminScopedRequest(req.url)) {
    return next(req);
  }
  const token = inject(AuthService).getAccessToken();
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
