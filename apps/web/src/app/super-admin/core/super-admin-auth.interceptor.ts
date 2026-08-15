import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { isSuperAdminScopedRequest } from './super-admin-scoped-request';
import { SuperAdminAuthService } from './super-admin-auth.service';

export const superAdminAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isSuperAdminScopedRequest(req.url)) {
    return next(req);
  }
  const token = inject(SuperAdminAuthService).getAccessToken();
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
