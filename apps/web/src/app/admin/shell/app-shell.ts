import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Button, Select, SelectOption, ThemeModeToggle } from 'design-system';
import { THEMES, ThemeMode, ThemeName, ThemeService } from 'design-tokens';
import { AuthService } from '../core/auth.service';

const THEME_OPTIONS: SelectOption[] = THEMES.map((theme) => ({
  value: theme.name,
  label: theme.label,
}));

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button, Select, ThemeModeToggle],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);

  protected readonly mode = this.themeService.mode;
  protected readonly theme = this.themeService.adminTheme;
  protected readonly themeOptions = THEME_OPTIONS;

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
  }

  protected onThemeChange(theme: string): void {
    this.themeService.setAdminTheme(document.documentElement, theme as ThemeName);
  }

  // index.html sets <base href="/">, so a plain href="#main-content" resolves
  // against that base (i.e. navigates to "/") instead of jumping within the
  // current route -- handled manually here instead.
  protected focusMainContent(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }

  protected async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigateByUrl('/login');
  }
}
