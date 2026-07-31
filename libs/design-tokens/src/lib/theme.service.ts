import { Injectable, signal } from '@angular/core';
import { DEFAULT_MODE, DEFAULT_THEME, ThemeMode, ThemeName } from './theme.types';

/**
 * Applies a ThemeName/ThemeMode pair to a DOM element via `data-theme` /
 * `data-mode` attributes, which the SCSS tokens in styles/*.scss key off.
 *
 * The Arena Pulse product shell (apps/web's /admin section, and its own
 * marketing/landing chrome) defaults to `ink-signal` but the organizer can
 * pick any of the three themes for their own dashboard (see `adminTheme`
 * below) — independent of a tournament's public theme, which is read from
 * `PublicPageConfiguration.theme` and applied to its own root element
 * instead, never to the whole document, so it never leaks into the product
 * shell (and vice versa).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<ThemeName>(DEFAULT_THEME);
  private readonly _mode = signal<ThemeMode>(DEFAULT_MODE);
  // The organizer's own choice of theme for /admin itself (distinct from a
  // tournament's public theme). Defaults to the product identity; once set,
  // resetThemeGuard restores this on every /admin entry instead of hardcoding
  // ink-signal, so the choice survives navigating away to a themed tournament
  // page and back.
  private readonly _adminTheme = signal<ThemeName>(DEFAULT_THEME);

  readonly theme = this._theme.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly adminTheme = this._adminTheme.asReadonly();

  apply(
    element: HTMLElement,
    theme: ThemeName = DEFAULT_THEME,
    mode: ThemeMode = DEFAULT_MODE,
  ): void {
    element.setAttribute('data-theme', theme);
    element.setAttribute('data-mode', mode);
    this._theme.set(theme);
    this._mode.set(mode);
  }

  setTheme(element: HTMLElement, theme: ThemeName): void {
    element.setAttribute('data-theme', theme);
    this._theme.set(theme);
  }

  setMode(element: HTMLElement, mode: ThemeMode): void {
    element.setAttribute('data-mode', mode);
    this._mode.set(mode);
  }

  /** Sets the organizer's own /admin theme choice and applies it immediately. */
  setAdminTheme(element: HTMLElement, theme: ThemeName): void {
    this._adminTheme.set(theme);
    this.setTheme(element, theme);
  }
}
