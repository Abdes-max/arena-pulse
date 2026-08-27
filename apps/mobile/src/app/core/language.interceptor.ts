import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LanguageService } from 'design-tokens';

// Mirrors apps/web/src/app/core/language.interceptor.ts exactly (same
// backend counterpart: apps/api/src/mail/decorators/mail-lang.decorator.ts).
// This app didn't send this header at all before the organizer auth flow
// (feat/193) needed it -- every transactional email a mobile-triggered
// request fires (verify-email, welcome) would otherwise always render in
// French regardless of the organizer's chosen app language.
export const LANGUAGE_HEADER = 'X-App-Language';

export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  const lang = inject(LanguageService).language();
  return next(req.clone({ setHeaders: { [LANGUAGE_HEADER]: lang } }));
};
