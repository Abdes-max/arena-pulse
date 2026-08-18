import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { MailLanguage, parseMailLanguage } from '../mail-language';

// The frontend's languageInterceptor (apps/web/src/app/core/language.interceptor.ts)
// sets this on every request, carrying the organizer's currently-active
// Transloco language (see the [[i18n-emails-transactionnels]] decision:
// language of the request that triggers the email, not a stored per-account
// preference). Absent entirely for server-to-server callers (the Stripe
// webhook) -- parseMailLanguage's fallback to French covers that case.
export const MAIL_LANGUAGE_HEADER = 'x-app-language';

export const MailLang = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MailLanguage => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return parseMailLanguage(request.headers[MAIL_LANGUAGE_HEADER]);
  },
);
