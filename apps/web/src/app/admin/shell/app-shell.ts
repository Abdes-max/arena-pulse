import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo } from 'design-system';
import { ThemeService } from 'design-tokens';
import { AuthService } from '../core/auth.service';
import { SessionTimeoutService } from '../core/session-timeout.service';
import { SettingsMenu } from '../shared/settings-menu';
import { TournamentSubmenu } from '../shared/tournament-submenu';
import { THEME_MAP } from '../core/theme-map';

/** Route data `hero`: the page title shown in the night band under the header. */
export interface AdminHero {
  title: string;
  lede?: string;
  back?: string;
  cancel?: string;
}
import { TournamentsService } from '../core/tournaments.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Button,
    Logo,
    SettingsMenu,
    TournamentSubmenu,
    TranslocoPipe,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  // Same account as a team manager: a link to its space when it has requests.
  protected readonly hasRegistrations = signal(false);
  private readonly publicApi = inject(PublicApiService);

  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly themeService = inject(ThemeService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly assetUrl = inject(AssetUrlService);
  protected readonly sessionTimeout = inject(SessionTimeoutService);
  private readonly destroyRef = inject(DestroyRef);

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

  protected readonly hero = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.currentHero()),
      startWith(this.currentHero()),
    ),
    { initialValue: null },
  );

  // The public site's header colors on a tournament's pages, the vitrine's
  // blue night everywhere else.
  protected readonly headerTheme = computed(() =>
    this.tournamentId() ? this.themeService.theme() : 'ink-signal',
  );

  // Mobile nav (< 720px, same breakpoint as the landing page's own
  // hamburger menu -- see landing.page.ts/.scss): the nav links, theme
  // toggle and logout button all move into this slide-down panel behind a
  // hamburger toggle instead of just wrapping/overflowing, which is what
  // this header did before (no responsive treatment at all).
  protected readonly mobileMenuOpen = signal(false);

  private currentHero(): AdminHero | null {
    return (this.route.snapshot.firstChild?.data['hero'] as AdminHero | undefined) ?? null;
  }

  constructor() {
    void this.publicApi
      .listMyRegistrations()
      .then((mine) => this.hasRegistrations.set(mine.length > 0))
      .catch(() => undefined);
    // 30 min idle / 8h absolute session policy, with its own 1-minute
    // warning popup (template below) -- see SessionTimeoutService's own
    // doc comment for why start()/stop() (not the service's own lifetime)
    // bound the clock to exactly this component's.
    this.sessionTimeout.start();
    this.destroyRef.onDestroy(() => this.sessionTimeout.stop());

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
    this.sessionTimeout.stop();
    await this.authService.logout();
    await this.router.navigateByUrl('/');
  }

  protected async extendSession(): Promise<void> {
    await this.sessionTimeout.extendSession();
  }

  protected logoutFromWarning(): void {
    void this.logout();
  }

  /** Back to the super-admin tournament page the assistance started from. */
  protected async leaveSupport(): Promise<void> {
    const tournamentId = this.authService.supportSession()?.tournamentId;
    this.authService.endSupportSession();
    await this.router.navigate(
      tournamentId ? ['/super-admin/tournaments', tournamentId] : ['/super-admin'],
    );
  }
}
