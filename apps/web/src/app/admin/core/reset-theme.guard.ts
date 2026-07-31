import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { ThemeService } from 'design-tokens';

/**
 * Defensive reset: guarantees /admin shows the organizer's own chosen admin
 * theme (`ThemeService.adminTheme`, ink-signal by default) rather than
 * whatever a tournament's public theme last set, regardless of how /admin
 * was reached (soft nav away from a themed tournament page, browser
 * back/forward, or a direct bookmark straight into /admin/tournaments where
 * no TournamentShell ever ran to begin with). TournamentShell's own
 * DestroyRef reset remains the first line of defense for the common case;
 * this is the belt-and-braces second line for the /admin side — now
 * load-bearing since public and admin routes share one running app instead
 * of being two separate origins.
 *
 * Only the theme (art direction) is reset here, not the light/dark mode —
 * mode is a user preference toggled from anywhere in the app (admin and
 * public alike) and must survive navigating between them.
 */
export const resetThemeGuard: CanActivateFn = () => {
  const themeService = inject(ThemeService);
  themeService.setTheme(document.documentElement, themeService.adminTheme());
  return true;
};
