import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideApiClient } from 'api-client';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { authInterceptor } from './admin/core/auth.interceptor';
import { AuthService } from './admin/core/auth.service';
import { GlobalErrorHandler } from './core/global-error-handler';
import { playerAuthInterceptor } from './core/player-auth.interceptor';
import { PlayerAuthService } from './core/player-auth.service';
import { superAdminAuthInterceptor } from './super-admin/core/super-admin-auth.interceptor';
import { SuperAdminAuthService } from './super-admin/core/super-admin-auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // anchorScrolling: the landing page's own nav (#fonctionnalites,
    // #sports, #tournois, #tarifs) already works via plain browser
    // same-page anchor clicks -- no Angular involvement needed there. But a
    // FRESH page load with a fragment (e.g. the mobile app's Paramètres
    // panel opening tournarena.com/#tarifs in the system browser) hits the
    // fragment before Angular has finished bootstrapping/rendering the SPA,
    // so the browser's native scroll-to-anchor fires too early and finds
    // nothing there yet. This re-attempts it once the route's finished
    // rendering (also covers the very first navigation, not just later
    // in-app ones).
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    // Each interceptor only ever attaches its own token to its own
    // URL-scoped requests (see player-scoped-request.ts /
    // super-admin-scoped-request.ts) — a no-op otherwise, so all three are
    // safe to register unconditionally together.
    provideHttpClient(
      withInterceptors([authInterceptor, playerAuthInterceptor, superAdminAuthInterceptor]),
    ),
    provideApiClient({ apiUrl: environment.apiUrl }),
    // Restores an organizer's session from the httpOnly refresh cookie on a
    // hard reload. Runs for every visitor, including anonymous public-site
    // traffic (harmless 401, caught silently in AuthService.silentRefresh).
    provideAppInitializer(() => inject(AuthService).silentRefresh()),
    // Same idea, for a PlayerAccount session (its own httpOnly cookie).
    provideAppInitializer(() => inject(PlayerAuthService).silentRefresh()),
    // Same idea, for a SuperAdminAccount session (its own httpOnly cookie).
    provideAppInitializer(() => inject(SuperAdminAuthService).silentRefresh()),
  ],
};
