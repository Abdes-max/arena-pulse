import { ThemeName } from 'design-tokens';
import { PublicTheme } from './models';

/** Maps the backend's PublicTheme enum to design-tokens' ThemeName (data-theme values). */
export const THEME_MAP: Record<PublicTheme, ThemeName> = {
  INK_SIGNAL: 'ink-signal',
  PULSE_EMBER: 'pulse-ember',
  NEON_COURT: 'neon-court',
};
