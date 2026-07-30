import { generateSlug } from './slug.util';

describe('generateSlug', () => {
  it('lowercases, strips accents, and dashes non-alphanumeric characters', () => {
    const slug = generateSlug('Coupe de France Été 2026');
    expect(slug).toMatch(/^coupe-de-france-ete-2026-[0-9a-f]{8}$/);
  });

  it('trims leading and trailing dashes from punctuation-only edges', () => {
    const slug = generateSlug('  !!! Le Tournoi !!!  ');
    expect(slug).toMatch(/^le-tournoi-[0-9a-f]{8}$/);
  });

  it('falls back to just the suffix when the name has no alphanumeric characters', () => {
    const slug = generateSlug('!!!');
    expect(slug).toMatch(/^[0-9a-f]{8}$/);
  });

  it('never produces the same slug twice for the same name', () => {
    const a = generateSlug('Coupe de France');
    const b = generateSlug('Coupe de France');
    expect(a).not.toBe(b);
  });
});
