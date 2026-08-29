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
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideTransloco } from '@jsverse/transloco';
import { SUPPORTED_LANGUAGES, TranslocoHttpLoader, resolveInitialLanguage } from 'design-tokens';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { GlobalErrorHandler } from './core/global-error-handler';
import { languageInterceptor } from './core/language.interceptor';
import { OrganizerAuthService } from './organizer/core/auth.service';
import { organizerAuthInterceptor } from './organizer/core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideRouter(routes),
    provideHttpClient(withInterceptors([languageInterceptor, organizerAuthInterceptor])),
    // Forced to 'md' (rather than Ionic's default per-platform auto-detect,
    // which picks 'ios' on a real iPhone) -- every page in this app was
    // built and visually tuned against 'md' mode's toolbar layout (a normal
    // flex row, ion-title left-aligned and taking the remaining width, see
    // e.g. every page's own `ion-title { text-align: start }` override).
    // 'ios' mode instead absolutely-centers ion-title independent of the
    // start/end slot content's width, which overlaps a start-slot logo with
    // the title text whenever the title is long enough -- invisible in every
    // form of testing this app had received so far (desktop Chrome, the
    // Android emulator, Playwright) since none of those ever render 'ios'
    // mode, only caught once tested on a real iPhone via TestFlight
    // (2026-08-29). Forcing 'md' everywhere, on both platforms, is far
    // cheaper than re-tuning every toolbar for 'ios' mode's different layout
    // rules, and keeps iOS visually consistent with the Android build.
    provideIonicAngular({ mode: 'md' }),
    provideApiClient({ apiUrl: environment.apiUrl }),
    // Restores an organizer session from the httpOnly refresh cookie on app
    // startup (same pattern as apps/web/src/app/app.config.ts) -- so
    // reopening the app after logging in once doesn't force a re-login.
    // Harmless 401 when there's no session yet, caught silently inside
    // OrganizerAuthService.silentRefresh().
    provideAppInitializer(() => inject(OrganizerAuthService).silentRefresh()),
    // Same reasoning as apps/web's own provideTransloco (see its comment):
    // resolveInitialLanguage() so the app boots straight into the right
    // language instead of flashing fr first.
    provideTransloco({
      config: {
        availableLangs: SUPPORTED_LANGUAGES.map((language) => language.code),
        defaultLang: resolveInitialLanguage(),
        fallbackLang: 'fr',
        reRenderOnLangChange: true,
        prodMode: environment.production,
        // See apps/web's identical option for why -- kept consistent
        // between both apps even though this app's own translations are
        // complete in all 6 languages (no per-key fallback currently relied
        // on here), so a future partial translation behaves the same way.
        missingHandler: { useFallbackTranslation: true },
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};
