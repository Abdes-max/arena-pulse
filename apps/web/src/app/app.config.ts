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
import { playerAuthInterceptor } from './core/player-auth.interceptor';
import { PlayerAuthService } from './core/player-auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideRouter(routes),
    // Each interceptor only ever attaches its own token to its own
    // URL-scoped requests (see player-scoped-request.ts) — a no-op
    // otherwise, so both are safe to register unconditionally together.
    provideHttpClient(withInterceptors([authInterceptor, playerAuthInterceptor])),
    provideApiClient({ apiUrl: environment.apiUrl }),
    // Restores an organizer's session from the httpOnly refresh cookie on a
    // hard reload. Runs for every visitor, including anonymous public-site
    // traffic (harmless 401, caught silently in AuthService.silentRefresh).
    provideAppInitializer(() => inject(AuthService).silentRefresh()),
    // Same idea, for a PlayerAccount session (its own httpOnly cookie).
    provideAppInitializer(() => inject(PlayerAuthService).silentRefresh()),
  ],
};
