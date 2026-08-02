import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Catches every error Angular's own change-detection/zone handling would
 * otherwise just console.error with no context. Combined with
 * provideBrowserGlobalErrorListeners() (app.config.ts) so window 'error' and
 * 'unhandledrejection' events -- outside Angular's zone -- also land here.
 * No external error-tracking SDK yet (see
 * docs/architecture/adr/0003-observability-strategy.md) -- structured
 * console output only, ready to forward to one later without touching call
 * sites elsewhere in the app.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error({
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      url: location.href,
      stack,
    });
  }
}
