import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PublicApiService } from 'api-client';
import { Logo, TextField, ThemeModeToggle, TournamentCard, TournamentMarquee } from 'design-system';
import { ThemeMode, ThemeService } from 'design-tokens';
import { PublicSport, PublicTournamentSummary } from 'shared-models';
import { AuthService } from '../../admin/core/auth.service';

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

  constructor() {
    void this.api.listTournaments(50).then((tournaments) => this.tournaments.set(tournaments));
    void this.api.listSports().then((sports) => this.sports.set(sports));
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
