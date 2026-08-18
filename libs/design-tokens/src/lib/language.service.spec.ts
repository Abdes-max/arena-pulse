import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageService, resolveInitialLanguage } from './language.service';

const STORAGE_KEY = 'arena-pulse:language';

const TRANSLATIONS = {
  fr: { greeting: 'Bonjour' },
  en: { greeting: 'Hello' },
  es: { greeting: 'Hola' },
};

describe('resolveInitialLanguage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('falls back to fr when nothing is stored and the browser language is unsupported', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP');

    expect(resolveInitialLanguage()).toBe('fr');
  });

  it('detects a supported browser language when nothing is stored', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');

    expect(resolveInitialLanguage()).toBe('es');
  });

  it('prefers the stored language over the browser language', () => {
    localStorage.setItem(STORAGE_KEY, 'de');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');

    expect(resolveInitialLanguage()).toBe('de');
  });

  it('ignores a stored value that is not one of the 6 supported languages', () => {
    localStorage.setItem(STORAGE_KEY, 'ja');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP');

    expect(resolveInitialLanguage()).toBe('fr');
  });
});

describe('LanguageService', () => {
  let service: LanguageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: TRANSLATIONS,
          translocoConfig: { availableLangs: ['fr', 'en', 'es', 'de', 'it', 'pt'], defaultLang: 'fr' },
          preloadLangs: true,
        }),
      ],
    });
    service = TestBed.inject(LanguageService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('reflects the active Transloco language', () => {
    expect(service.language()).toBe('fr');
  });

  it('setLanguage switches the active language and persists the choice', () => {
    service.setLanguage('es');

    expect(service.language()).toBe('es');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('es');
  });
});
