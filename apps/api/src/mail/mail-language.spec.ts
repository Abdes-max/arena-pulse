import { DEFAULT_MAIL_LANGUAGE, parseMailLanguage } from './mail-language';

describe('parseMailLanguage', () => {
  it.each(['fr', 'en', 'es', 'de', 'it', 'pt'] as const)(
    'accepts %s as-is',
    (lang) => {
      expect(parseMailLanguage(lang)).toBe(lang);
    },
  );

  it('falls back to the default language when the header is missing', () => {
    expect(parseMailLanguage(undefined)).toBe(DEFAULT_MAIL_LANGUAGE);
  });

  it('falls back to the default language for an unsupported code', () => {
    expect(parseMailLanguage('xx')).toBe(DEFAULT_MAIL_LANGUAGE);
  });

  it('falls back to the default language for a non-string value (e.g. a duplicated header)', () => {
    expect(parseMailLanguage(['fr', 'en'])).toBe(DEFAULT_MAIL_LANGUAGE);
  });
});
