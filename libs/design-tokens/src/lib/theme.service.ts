import { Injectable, signal } from '@angular/core';
import { DEFAULT_MODE, DEFAULT_THEME, ThemeMode, ThemeName } from './theme.types';

/**
 * Applies a ThemeName/ThemeMode pair to a DOM element via `data-theme` /
 * `data-mode` attributes, which the SCSS tokens in styles/*.scss key off.
 *
 * The Arena Pulse product shell (admin-web, and public-web's own chrome)
 * always uses `ink-signal`. A tournament's public site reads its theme
 * from `PublicPageConfiguration.theme` and applies it to its own root
 * element instead — never to the whole document — so an organizer's theme
 * choice never leaks into the product shell.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<ThemeName>(DEFAULT_THEME);
  private readonly _mode = signal<ThemeMode>(DEFAULT_MODE);

  readonly theme = this._theme.asReadonly();
  readonly mode = this._mode.asReadonly();

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
}
