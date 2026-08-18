import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/**
 * Minimal TranslocoLoader over HttpClient -- @jsverse/transloco ships no
 * built-in HTTP loader (only DefaultLoader, an in-memory map), and there was
 * no need to add a whole extra package (@jsverse/transloco-http-loader) for
 * what's a one-line GET. Fetches `/i18n/{lang}.json`, resolved relative to
 * each app's own origin -- both apps/web and apps/mobile serve their
 * `public/i18n/*.json` files at that exact path (Angular's `public/` assets
 * convention), so this one loader class works unmodified for both.
 */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}
