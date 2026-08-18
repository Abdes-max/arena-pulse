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
import { provideTransloco } from '@jsverse/transloco';
import { SUPPORTED_LANGUAGES, TranslocoHttpLoader, resolveInitialLanguage } from 'design-tokens';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { authInterceptor } from './admin/core/auth.interceptor';
import { AuthService } from './admin/core/auth.service';
import { GlobalErrorHandler } from './core/global-error-handler';
import { languageInterceptor } from './core/language.interceptor';
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
      withInterceptors([
        authInterceptor,
        playerAuthInterceptor,
        superAdminAuthInterceptor,
        languageInterceptor,
      ]),
    ),
    provideApiClient({ apiUrl: environment.apiUrl }),
    // resolveInitialLanguage() (not a hardcoded 'fr') so the very first
    // render already shows the right language -- persisted choice, else
    // detected navigator.language, else fr -- instead of booting in fr and
    // immediately switching, which would fetch (and briefly flash) two
    // translation files instead of one. See LanguageService for the
    // reactive side of this (setLanguage() switches + persists later).
    provideTransloco({
      config: {
        availableLangs: SUPPORTED_LANGUAGES.map((language) => language.code),
        defaultLang: resolveInitialLanguage(),
        fallbackLang: 'fr',
        reRenderOnLangChange: true,
        prodMode: environment.production,
        // false by default -- a *missing* key (as opposed to a failed
        // language load) otherwise renders as the raw key string instead of
        // silently resolving from fallbackLang. Needed for legal.terms/
        // legal.privacy's section* keys, deliberately only translated in
        // fr/en for this lot (see terms.page.ts) -- without this, opening
        // those pages in es/de/it/pt showed literal "legal.terms.section1.title"
        // text instead of the French fallback the "translation coming soon"
        // banner promises.
        missingHandler: { useFallbackTranslation: true },
      },
      loader: TranslocoHttpLoader,
    }),
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
