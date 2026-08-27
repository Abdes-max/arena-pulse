import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { OrganizerAuthService } from './auth.service';

// Simpler than apps/web/src/app/admin/core/auth.interceptor.ts: this app has
// only one kind of authenticated caller (the organizer), so there's no
// player-/super-admin-scoped token to avoid overriding. The public endpoints
// PublicApiService calls are all @Public() server-side and ignore the
// Authorization header entirely, so attaching it unconditionally is harmless.
export const organizerAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(OrganizerAuthService).getAccessToken();
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
