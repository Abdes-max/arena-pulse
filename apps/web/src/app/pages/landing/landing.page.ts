import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  LanguageSwitcher,
  Logo,
  TextField,
  ThemeModeToggle,
  TournamentCard,
  TournamentMarquee,
} from 'design-system';
import {
  LanguageCode,
  LanguageService,
  SUPPORTED_LANGUAGES,
  ThemeMode,
  ThemeService,
} from 'design-tokens';
import { PublicSport, PublicTournamentSummary } from 'shared-models';
import { AuthService } from '../../admin/core/auth.service';

// One concrete, product-true detail per sport (not interchangeable filler)
// for the #sports section -- each names a real TournArena capability
// (poules, tirs au but, prolongations, têtes de série...) rather than a
// generic "manage your tournament" line repeated nine times. Falls back to
// a neutral line for any sport seeded later that isn't listed here yet.
// Maps to a landing.sports.description.* Transloco key (not the text
// itself) so the description re-renders reactively on language change, same
// reasoning as every other string on this page -- the switch/case's keys
// (backend sport names, e.g. "Football") are data, distinct from the
// Transloco keys they map to.
const SPORT_DESCRIPTION_KEYS: Record<string, string> = {
  Football: 'landing.sports.description.football',
  Basketball: 'landing.sports.description.basketball',
  Volleyball: 'landing.sports.description.volleyball',
  Handball: 'landing.sports.description.handball',
  Rugby: 'landing.sports.description.rugby',
  Tennis: 'landing.sports.description.tennis',
  Badminton: 'landing.sports.description.badminton',
  Futsal: 'landing.sports.description.futsal',
  Esport: 'landing.sports.description.esport',
};
const DEFAULT_SPORT_DESCRIPTION_KEY = 'landing.sports.description.default';

@Component({
  selector: 'app-landing-page',
  imports: [
    RouterLink,
    LanguageSwitcher,
    Logo,
    ThemeModeToggle,
    TournamentCard,
    TournamentMarquee,
    TextField,
    TranslocoPipe,
  ],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);
  private readonly api = inject(PublicApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly viewportScroller = inject(ViewportScroller);
  private readonly assetUrl = inject(AssetUrlService);
  protected readonly authService = inject(AuthService);

  protected readonly mode = this.themeService.mode;
  protected readonly language = this.languageService.language;
  protected readonly languages = SUPPORTED_LANGUAGES;
  protected readonly tournaments = signal<PublicTournamentSummary[]>([]);
  protected readonly sports = signal<PublicSport[]>([]);
  protected readonly query = signal('');
  // Mobile nav (< 720px, see .landing-page__nav-links breakpoint): the
  // Fonctionnalités/Sports/Tarifs links and the CTA/login buttons all move
  // into this slide-down panel behind a hamburger toggle instead of being
  // hidden outright, which is what broke access to them on mobile before.
  protected readonly mobileMenuOpen = signal(false);

  // Client-side over a wider-than-displayed fetch (50, not just the first
  // handful) -- same pattern as team-search.page's filteredTeams, and simple
  // enough while the directory stays this size. Revisit with a server-side
  // search param if the published-tournament count ever outgrows one page.
  protected readonly filteredTournaments = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) {
      return this.tournaments();
    }
    return this.tournaments().filter(
      (t) => t.name.toLowerCase().includes(q) || t.sportName.toLowerCase().includes(q),
    );
  });

  // ap-tournament-marquee's TournamentMarqueeItem needs a resolved (absolute)
  // logoUrl -- it's a dumb presenter, same reason ap-tournament-card gets
  // its own [logoUrl]="logoUrl(t.logoUrl)" binding per-card below instead.
  protected readonly marqueeTournaments = computed(() =>
    this.tournaments().map((t) => ({ ...t, logoUrl: this.logoUrl(t.logoUrl) })),
  );

  constructor() {
    const tournamentsLoaded = this.api
      .listTournaments(50)
      .then((tournaments) => this.tournaments.set(tournaments));
    const sportsLoaded = this.api.listSports().then((sports) => this.sports.set(sports));

    // withInMemoryScrolling's anchorScrolling (app.config.ts) scrolls to the
    // URL's fragment on NavigationEnd, which fires immediately -- long
    // before these two API calls resolve. #tarifs sits below both the
    // tournaments and sports sections, whose height depends entirely on
    // what comes back (empty tournaments()/sports() render nothing), so a
    // visitor opening a direct link to /#tarifs (e.g. the mobile app's
    // Paramètres > Tarifs row) landed short of the real section: the page
    // was scrolled to where #tarifs would be in the *empty* layout, then
    // grew taller underneath the viewport once data arrived. How far short
    // depended on how tall the tournaments/sports grids render at that
    // viewport's width (a different number of cards per row on phone vs.
    // tablet vs. desktop) -- which is exactly why this looked like landing
    // in a different section altogether depending on the device, even
    // though it's the same one root cause everywhere.
    void Promise.all([tournamentsLoaded, sportsLoaded]).then(() => {
      const fragment = this.route.snapshot.fragment;
      if (!fragment) {
        return;
      }
      const scrollToFragment = () => this.viewportScroller.scrollToAnchor(fragment);
      // Double rAF: one frame to let Angular flush the signal updates above
      // into the DOM, a second to make sure that layout has actually been
      // committed before scrolling against it -- a single frame can still
      // catch the browser mid-reflow, especially on slower mobile devices.
      requestAnimationFrame(() => requestAnimationFrame(scrollToFragment));
      // Images (tournament/sport logos) can shift the layout again once
      // *they* finish loading, later than the frame above -- re-correct
      // once more after the whole page (images included) has settled, if
      // it hasn't already by then.
      if (document.readyState !== 'complete') {
        window.addEventListener('load', scrollToFragment, { once: true });
      }
    });
  }

  protected logoUrl(url: string | null): string | null {
    return this.assetUrl.resolve(url);
  }

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
  }

  protected onLanguageChange(code: string): void {
    this.languageService.setLanguage(code as LanguageCode);
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
  }

  // Nav "Sports" dropdown item -- filters the tournaments grid by this
  // sport's name, reusing the same search box the grid already exposes,
  // and lets the #tournaments anchor (native <a href>) scroll there.
  protected onSportNavClick(sportName: string): void {
    this.query.set(sportName);
  }

  protected sportDescriptionKey(sportName: string): string {
    return SPORT_DESCRIPTION_KEYS[sportName] ?? DEFAULT_SPORT_DESCRIPTION_KEY;
  }

  protected goToTournament(tournament: PublicTournamentSummary): void {
    void this.router.navigate(['/', tournament.slug]);
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
  }
}
