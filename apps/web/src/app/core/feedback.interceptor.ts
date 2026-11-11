import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { SnackbarService } from './snackbar.service';

/** Set on a request to keep it out of the snackbars (e.g. a background save). */
export const SILENT_FEEDBACK = new HttpContextToken<boolean>(() => false);

// Organizer and super-admin endpoints only: the public site and the auth
// flows (login, refresh...) keep their own inline messages.
const SCOPES = ['/organizations/', '/super-admin/'];

/**
 * Every change made in the admin (POST/PUT/PATCH/DELETE) confirms itself in a
 * snackbar, and every failure shows the API's own message there too -- the
 * page's inline message, when it has one, often sits far above the button.
 * Errors carrying a `code` are skipped: the page handles those itself (a
 * confirmation to ask, a payment step...).
 */
export const feedbackInterceptor: HttpInterceptorFn = (req, next) => {
  const inScope =
    req.url.startsWith(environment.apiUrl) && SCOPES.some((scope) => req.url.includes(scope));
  if (!inScope || req.method === 'GET' || req.context.get(SILENT_FEEDBACK)) {
    return next(req);
  }
  const snackbar = inject(SnackbarService);
  const transloco = inject(TranslocoService);
  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          snackbar.success(
            transloco.translate(req.method === 'DELETE' ? 'feedback.deleted' : 'feedback.saved'),
          );
        }
      },
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status === 401) {
          return;
        }
        const body = error.error as { message?: unknown; code?: unknown } | null;
        if (body && typeof body.code === 'string') {
          return;
        }
        const message = Array.isArray(body?.message)
          ? body.message.filter((part) => typeof part === 'string').join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : '';
        snackbar.error(
          message ||
            transloco.translate(error.status === 0 ? 'feedback.offline' : 'feedback.error'),
        );
      },
    }),
  );
};
