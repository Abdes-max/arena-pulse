/**
 * The 6 languages the product supports (docs/product request: FR/EN/ES/DE/IT/PT).
 * Own file, same split as theme.types.ts/theme.service.ts, so both apps can
 * import just the types (e.g. for a translation file's own TS shape) without
 * pulling in TranslocoService.
 */
export type LanguageCode = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

export interface LanguageDescriptor {
  code: LanguageCode;
  /** Each language's own name for itself (Français/English/Español/...),
   *  same convention as the Tournify reference the porteur de projet shared
   *  -- never translated, so it stays recognizable regardless of the
   *  currently active language. */
  label: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageDescriptor[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'fr';
