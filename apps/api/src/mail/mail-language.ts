// The 6 languages the product's frontend (apps/web) already supports via
// Transloco (libs/design-tokens/src/lib/language.types.ts) -- kept as its
// own small type here rather than importing that lib, since apps/api has no
// existing dependency on any frontend-oriented library and this is the only
// thing the backend needs from it (just the 6 codes, not the whole language
// metadata/labels).
export type MailLanguage = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

export const DEFAULT_MAIL_LANGUAGE: MailLanguage = 'fr';

const SUPPORTED_MAIL_LANGUAGES: readonly MailLanguage[] = [
  'fr',
  'en',
  'es',
  'de',
  'it',
  'pt',
];

/**
 * Validates an arbitrary header value against the 6 supported codes,
 * falling back to French (the app's historical-and-still-default language)
 * for anything missing, malformed, or unrecognized -- same permissive
 * fallback the frontend's own LanguageService applies for an unsupported
 * stored/browser locale.
 */
export function parseMailLanguage(value: unknown): MailLanguage {
  return typeof value === 'string' &&
    SUPPORTED_MAIL_LANGUAGES.includes(value as MailLanguage)
    ? (value as MailLanguage)
    : DEFAULT_MAIL_LANGUAGE;
}
