/**
 * The five art directions from docs/design/visual-language.md.
 *
 * `ink-signal` is also the fixed TournArena product identity (admin +
 * marketing); all five remain selectable as a tournament's public site /
 * slideshow theme (docs/architecture/data-model.md: PublicPageConfiguration.theme).
 * `fresh-pitch` and `crimson-charge` were added after the original three
 * (see visual-language.md's own "un 4e thème pourra être ajouté" note) --
 * same model, just two more enum values + token sets, no other change.
 */
export type ThemeName =
  'ink-signal' | 'pulse-ember' | 'neon-court' | 'fresh-pitch' | 'crimson-charge';

export type ThemeMode = 'light' | 'dark';

export interface ThemeDescriptor {
  name: ThemeName;
  label: string;
  isProductIdentity: boolean;
}

export const THEMES: readonly ThemeDescriptor[] = [
  { name: 'ink-signal', label: 'Ink & Signal', isProductIdentity: true },
  { name: 'pulse-ember', label: 'Pulse Ember', isProductIdentity: false },
  { name: 'neon-court', label: 'Neon Court', isProductIdentity: false },
  { name: 'fresh-pitch', label: 'Fresh Pitch', isProductIdentity: false },
  { name: 'crimson-charge', label: 'Crimson Charge', isProductIdentity: false },
];

export const DEFAULT_THEME: ThemeName = 'ink-signal';
export const DEFAULT_MODE: ThemeMode = 'light';
