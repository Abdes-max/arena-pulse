import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { DEFAULT_THEME, ThemeService } from 'design-tokens';

/**
 * Defensive reset: guarantees the product-shell identity (ink-signal) is
 * applied before entering /admin, regardless of how it was reached (soft
 * nav away from a themed tournament page, browser back/forward, or a direct
 * bookmark straight into /admin/tournaments where no TournamentShell ever
 * ran to begin with). TournamentShell's own DestroyRef reset remains the
 * first line of defense for the common case; this is the belt-and-braces
 * second line for the /admin side — now load-bearing since public and admin
 * routes share one running app instead of being two separate origins.
 *
 * Only the theme (art direction) is reset here, not the light/dark mode —
 * mode is a user preference toggled from anywhere in the app (admin and
 * public alike) and must survive navigating between them.
 */
export const resetThemeGuard: CanActivateFn = () => {
  inject(ThemeService).setTheme(document.documentElement, DEFAULT_THEME);
  return true;
};
