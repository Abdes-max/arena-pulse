import { Component, signal } from '@angular/core';
import { Badge, Button, MatchCard } from 'design-system';
import { THEMES, ThemeMode, ThemeName } from 'design-tokens';

/**
 * Temporary style-guide showcase proving the design system libraries are
 * wired correctly end-to-end (tokens + components + theme switching).
 * Real screens replace this in feat/015-public-tournament-web.
 */
@Component({
  selector: 'app-root',
  imports: [Button, Badge, MatchCard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly themes = THEMES;
  protected readonly theme = signal<ThemeName>('ink-signal');
  protected readonly mode = signal<ThemeMode>('light');

  protected setTheme(theme: ThemeName): void {
    this.theme.set(theme);
  }

  protected toggleMode(): void {
    this.mode.set(this.mode() === 'light' ? 'dark' : 'light');
  }
}
