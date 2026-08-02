import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideApiClient } from 'api-client';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { authInterceptor } from './admin/core/auth.interceptor';
import { AuthService } from './admin/core/auth.service';
import { GlobalErrorHandler } from './core/global-error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideRouter(routes),
    // Adds an Authorization header only `if (token)` — a no-op for anonymous
    // public-site requests with no admin session, so this is safe to share.
    provideHttpClient(withInterceptors([authInterceptor])),
    provideApiClient({ apiUrl: environment.apiUrl }),
    // Restores an organizer's session from the httpOnly refresh cookie on a
    // hard reload. Runs for every visitor, including anonymous public-site
    // traffic (harmless 401, caught silently in AuthService.silentRefresh).
    provideAppInitializer(() => inject(AuthService).silentRefresh()),
  ],
};
