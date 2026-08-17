import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AssetUrlService, PublicApiService } from 'api-client';
import { Logo, TextField, ThemeModeToggle, TournamentCard, TournamentMarquee } from 'design-system';
import { ThemeMode, ThemeService } from 'design-tokens';
import { PublicSport, PublicTournamentSummary } from 'shared-models';
import { AuthService } from '../../admin/core/auth.service';

// One concrete, product-true detail per sport (not interchangeable filler)
// for the #sports section -- each names a real TournArena capability
// (poules, tirs au but, prolongations, têtes de série...) rather than a
// generic "manage your tournament" line repeated nine times. Falls back to
// a neutral line for any sport seeded later that isn't listed here yet.
const SPORT_DESCRIPTIONS: Record<string, string> = {
  Football:
    'Poules puis phase finale, tirs au but en cas d’égalité — le format classique, entièrement automatisé.',
  Basketball:
    'Championnat ou play-offs, prolongations gérées match par match, classement recalculé à chaque panier.',
  Volleyball: 'Sets comptés, tableaux à élimination directe pour les phases finales de vos ligues.',
  Handball:
    'Poules et tableaux croisés, jusqu’aux demi-finales et à la petite finale si vous la jouez.',
  Rugby:
    'Championnat toutes rondes ou tournoi à élimination — classements par bonus, à votre façon.',
  Tennis:
    'Tableaux à élimination directe, têtes de série et byes gérés automatiquement à chaque tour.',
  Badminton:
    'Simples, doubles, plusieurs catégories d’âge dans un même tournoi — chacune son propre tableau.',
  Futsal: 'Le même moteur que le foot à onze, calibré pour vos formats en salle.',
  Esport:
    'Tournois en ligne ou LAN, un site public en direct pour suivre chaque match comme les autres sports.',
};
const DEFAULT_SPORT_DESCRIPTION =
  'Poules, championnat ou élimination directe — votre format, vos règles.';

@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, Logo, ThemeModeToggle, TournamentCard, TournamentMarquee, TextField],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
  private readonly themeService = inject(ThemeService);
  private readonly api = inject(PublicApiService);
  private readonly router = inject(Router);
  private readonly assetUrl = inject(AssetUrlService);
  protected readonly authService = inject(AuthService);

  protected readonly mode = this.themeService.mode;
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
    void this.api.listTournaments(50).then((tournaments) => this.tournaments.set(tournaments));
    void this.api.listSports().then((sports) => this.sports.set(sports));
  }

  protected logoUrl(url: string | null): string | null {
    return this.assetUrl.resolve(url);
  }

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
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

  protected sportDescription(sportName: string): string {
    return SPORT_DESCRIPTIONS[sportName] ?? DEFAULT_SPORT_DESCRIPTION;
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
