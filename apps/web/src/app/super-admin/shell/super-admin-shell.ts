import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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

  // Mobile nav (< 720px, same breakpoint and pattern as admin/shell/app-shell
  // and the landing page's own hamburger menu): the nav links and logout
  // button move into this slide-down panel behind a hamburger toggle
  // instead of wrapping/overflowing on a narrow screen.
  protected readonly mobileMenuOpen = signal(false);

  constructor() {
    // Platform-wide, not tied to any tournament or organizer -- same fixed
    // product identity idiom as CollaboratorsPage/OrganizationSubscriptionPage.
    // No reset-on-destroy needed here (unlike those pages): /admin's own
    // resetThemeGuard already re-applies the right theme on its own next
    // entry, and this shell is never nested inside that tree.
    this.themeService.setTheme(document.documentElement, DEFAULT_THEME);
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected async logout(): Promise<void> {
    this.closeMobileMenu();
    await this.authService.logout();
    await this.router.navigateByUrl('/super-admin/login');
  }
}
