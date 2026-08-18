import { Injectable, Signal, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { DEFAULT_LANGUAGE, LanguageCode, SUPPORTED_LANGUAGES } from './language.types';

const STORAGE_KEY = 'arena-pulse:language';

function isSupported(code: string | null): code is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code);
}

// Same try/catch-silent pattern as apps/mobile's FavoritesService: storage
// unavailable (private browsing, quota) just means the choice won't persist
// across reloads, not a hard failure.
function readStoredLanguage(): LanguageCode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isSupported(raw) ? raw : null;
  } catch {
    return null;
  }
}

function detectBrowserLanguage(): LanguageCode | null {
  if (typeof navigator === 'undefined') {
    return null;
  }
  const short = navigator.language?.slice(0, 2).toLowerCase() ?? null;
  return isSupported(short) ? short : null;
}

/**
 * Pure function (no DI, no TranslocoService) so it can compute
 * provideTransloco()'s own `defaultLang` at bootstrap time, before Transloco
 * itself exists to inject -- resolving the initial language this way (rather
 * than always booting with a hardcoded default lang and immediately calling
 * setActiveLang from within LanguageService's constructor) avoids fetching
 * one language's translation file just to throw it away for another.
 */
export function resolveInitialLanguage(): LanguageCode {
  return readStoredLanguage() ?? detectBrowserLanguage() ?? DEFAULT_LANGUAGE;
}

/**
 * Thin wrapper over TranslocoService, calqué sur ThemeService: exposes the
 * active language as a read-only signal and a setLanguage() that switches it
 * and persists the choice -- same localStorage convention as
 * FavoritesService (apps/mobile/src/app/core/favorites.service.ts).
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);

  // TranslocoService.activeLang is already a signal reflecting the current
  // language -- no need to re-derive one via toSignal(langChanges$, ...).
  readonly language: Signal<string> = this.transloco.activeLang;

  setLanguage(code: LanguageCode): void {
    this.transloco.setActiveLang(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Storage unavailable -- the choice just won't survive a reload.
    }
  }
}
