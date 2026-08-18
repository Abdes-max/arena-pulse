import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideApiClient } from 'api-client';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideTransloco } from '@jsverse/transloco';
import { SUPPORTED_LANGUAGES, TranslocoHttpLoader, resolveInitialLanguage } from 'design-tokens';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { GlobalErrorHandler } from './core/global-error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideRouter(routes),
    provideHttpClient(),
    provideIonicAngular(),
    provideApiClient({ apiUrl: environment.apiUrl }),
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
