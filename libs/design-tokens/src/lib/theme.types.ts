/**
 * The three art directions from docs/design/visual-language.md.
 *
 * `ink-signal` is also the fixed Arena Pulse product identity (admin +
 * marketing); all three remain selectable as a tournament's public site /
 * slideshow theme (docs/architecture/data-model.md: PublicPageConfiguration.theme).
 */
export type ThemeName = 'ink-signal' | 'pulse-ember' | 'neon-court';

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
];

export const DEFAULT_THEME: ThemeName = 'ink-signal';
export const DEFAULT_MODE: ThemeMode = 'light';
