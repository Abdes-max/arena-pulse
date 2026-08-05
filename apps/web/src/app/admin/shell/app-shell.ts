import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { Button, ThemeModeToggle } from 'design-system';
import { ThemeMode, ThemeService } from 'design-tokens';
import { AuthService } from '../core/auth.service';
import { TournamentSubmenu } from '../shared/tournament-submenu';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button, ThemeModeToggle, TournamentSubmenu],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly themeService = inject(ThemeService);

  protected readonly mode = this.themeService.mode;

  // tournamentId lives on whichever leaf route is currently active (teams,
  // referees, schedule…), not on AppShell's own route -- re-read from the
  // route snapshot on every navigation so the header submenu knows when to
  // show up.
  protected readonly tournamentId = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.route.snapshot.firstChild?.paramMap.get('tournamentId') ?? null),
      startWith(this.route.snapshot.firstChild?.paramMap.get('tournamentId') ?? null),
    ),
    { initialValue: null },
  );

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
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
