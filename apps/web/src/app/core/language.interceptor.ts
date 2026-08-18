import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LanguageService } from 'design-tokens';

// Backend counterpart: apps/api/src/mail/decorators/mail-lang.decorator.ts
// reads this same header to pick the language for any transactional email a
// request triggers (invitation, email verification, welcome, payment
// receipts) -- see the [[i18n-emails-transactionnels]] decision: the
// language of the request that triggers the email, not a stored per-account
// preference. Applied app-wide (admin, public, player, super-admin) rather
// than scoped to admin requests only -- harmless for endpoints that ignore
// it, and keeps this interceptor from needing to know which specific routes
// happen to send mail.
export const LANGUAGE_HEADER = 'X-App-Language';

export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  const lang = inject(LanguageService).language();
  return next(req.clone({ setHeaders: { [LANGUAGE_HEADER]: lang } }));
};
