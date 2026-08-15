import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Button, Logo } from 'design-system';
import { DEFAULT_THEME, ThemeService } from 'design-tokens';
import { SuperAdminAuthService } from '../core/super-admin-auth.service';

@Component({
  selector: 'app-super-admin-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button, Logo],
  templateUrl: './super-admin-shell.html',
  styleUrl: './super-admin-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminShell {
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  protected readonly authService = inject(SuperAdminAuthService);

  constructor() {
    // Platform-wide, not tied to any tournament or organizer -- same fixed
    // product identity idiom as CollaboratorsPage/OrganizationSubscriptionPage.
    // No reset-on-destroy needed here (unlike those pages): /admin's own
    // resetThemeGuard already re-applies the right theme on its own next
    // entry, and this shell is never nested inside that tree.
    this.themeService.setTheme(document.documentElement, DEFAULT_THEME);
  }

  protected async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigateByUrl('/super-admin/login');
  }
}
