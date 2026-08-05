import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

/**
 * Sun/moon slide switch for the light/dark mode toggle (top-right corner of
 * every shell). Purely presentational, like ap-select/ap-tabs: it takes the
 * current mode and emits the mode to switch to -- the consuming
 * shell/page still owns the actual ThemeService.setMode(document.documentElement, ...)
 * call, so this component has no dependency on design-tokens.
 */
@Component({
  selector: 'ap-theme-mode-toggle',
  imports: [],
  templateUrl: './theme-mode-toggle.html',
  styleUrl: './theme-mode-toggle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-mode]': 'mode()',
  },
})
export class ThemeModeToggle {
  readonly mode = input.required<ThemeMode>();
  readonly modeChange = output<ThemeMode>();

  protected toggle(): void {
    this.modeChange.emit(this.mode() === 'dark' ? 'light' : 'dark');
  }
}
