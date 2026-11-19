import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { OrganizerAuthService } from './auth.service';

// One account for organizers and team managers: its token goes on every
// request, the registrations included. The public endpoints
// PublicApiService calls are all @Public() server-side and ignore the
// Authorization header entirely, so attaching it unconditionally is harmless.
export const organizerAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(OrganizerAuthService).getAccessToken();
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
