import { randomBytes } from 'node:crypto';

const COMBINING_DIACRITICS = /\p{Diacritic}/gu;

/**
 * Slugs always carry a random suffix (rather than relying on a retry loop on
 * unique-constraint failure) so two tournaments named identically never race
 * on the same base slug.
 */
export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = randomBytes(4).toString('hex');
  return base ? `${base}-${suffix}` : suffix;
}
