import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideApiClient } from 'api-client';
import { provideIonicAngular } from '@ionic/angular/standalone';

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
  ],
};
