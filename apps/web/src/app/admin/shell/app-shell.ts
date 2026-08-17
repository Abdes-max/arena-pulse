import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
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
import { AssetUrlService } from 'api-client';
import { Button, Logo, ThemeModeToggle } from 'design-system';
import { ThemeMode, ThemeService } from 'design-tokens';
import { AuthService } from '../core/auth.service';
import { TournamentSubmenu } from '../shared/tournament-submenu';
import { THEME_MAP } from '../core/theme-map';
import { TournamentsService } from '../core/tournaments.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Button,
    Logo,
    ThemeModeToggle,
    TournamentSubmenu,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly themeService = inject(ThemeService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly mode = this.themeService.mode;
  private readonly organizationId = computed(() => this.authService.organizations()[0]?.id ?? null);
  // Public slug for the "Lien public" link next to the submenu tabs --
  // fetched alongside the theme below (null hides the button, e.g. while
  // on 'tournaments/new' or a non-tournament-scoped page).
  protected readonly tournamentSlug = signal<string | null>(null);
  // The link only makes sense once there's something public to visit --
  // an unpublished tournament's site 404s for a visitor.
  protected readonly tournamentPublished = signal(false);
  // Small logo+name line above the submenu tabs -- fetched alongside the
  // theme below (null hides it, same lifecycle as tournamentSlug).
  protected readonly tournamentName = signal<string | null>(null);
  protected readonly tournamentLogoUrl = signal<string | null>(null);

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

  // The "new tournament" route has no tournamentId yet (nothing saved to
  // link a submenu to), but is still tournament-scoped in spirit -- you're
  // already personalizing one organization's tournament, not looking at the
  // product's own brand mark, so it should hide the logo the same way an
  // existing tournament's pages do.
  private readonly isCreatingTournament = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.route.snapshot.firstChild?.routeConfig?.path === 'tournaments/new'),
      startWith(this.route.snapshot.firstChild?.routeConfig?.path === 'tournaments/new'),
    ),
    { initialValue: false },
  );

  protected readonly showBrandMark = computed(
    () => this.tournamentId() === null && !this.isCreatingTournament(),
  );

  // Mobile nav (< 720px, same breakpoint as the landing page's own
  // hamburger menu -- see landing.page.ts/.scss): the nav links, theme
  // toggle and logout button all move into this slide-down panel behind a
  // hamburger toggle instead of just wrapping/overflowing, which is what
  // this header did before (no responsive treatment at all).
  protected readonly mobileMenuOpen = signal(false);

  constructor() {
    // Applies the current tournament's own public theme to the whole admin
    // shell regardless of which of its sub-pages (Équipes, Arbitres,
    // Structure, Calendrier, Scores, Classement...) is active or freshly
    // reloaded -- previously only TournamentFormPage (Général) did this on
    // load, so refreshing any other tab showed the default theme until the
    // organizer navigated back to Général.
    effect(() => {
      const organizationId = this.organizationId();
      const tournamentId = this.tournamentId();
      if (!organizationId || !tournamentId) {
        this.tournamentSlug.set(null);
        this.tournamentPublished.set(false);
        this.tournamentName.set(null);
        this.tournamentLogoUrl.set(null);
        return;
      }
      void this.applyTournamentTheme(organizationId, tournamentId);
    });
  }

  private async applyTournamentTheme(organizationId: string, tournamentId: string): Promise<void> {
    try {
      const tournament = await this.tournamentsService.getTournament(organizationId, tournamentId);
      this.tournamentSlug.set(tournament.slug);
      this.tournamentPublished.set(tournament.status === 'PUBLISHED');
      this.tournamentName.set(tournament.name);
      this.tournamentLogoUrl.set(this.assetUrl.resolve(tournament.logoUrl));
      this.themeService.setAdminTheme(document.documentElement, THEME_MAP[tournament.theme]);
    } catch {
      this.tournamentSlug.set(null);
      this.tournamentPublished.set(false);
      this.tournamentName.set(null);
      this.tournamentLogoUrl.set(null);
    }
  }

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  // index.html sets <base href="/">, so a plain href="#main-content" resolves
  // against that base (i.e. navigates to "/") instead of jumping within the
  // current route -- handled manually here instead.
  protected focusMainContent(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }

  protected async logout(): Promise<void> {
    this.closeMobileMenu();
    await this.authService.logout();
    await this.router.navigateByUrl('/');
  }
}
