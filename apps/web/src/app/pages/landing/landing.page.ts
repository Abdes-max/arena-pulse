import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PublicApiService } from 'api-client';
import { Logo, TextField, ThemeModeToggle, TournamentCard, TournamentMarquee } from 'design-system';
import { ThemeMode, ThemeService } from 'design-tokens';
import { PublicTournamentSummary } from 'shared-models';

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

  protected readonly mode = this.themeService.mode;
  protected readonly tournaments = signal<PublicTournamentSummary[]>([]);
  protected readonly query = signal('');

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
  }

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
  }

  protected goToTournament(tournament: PublicTournamentSummary): void {
    void this.router.navigate(['/', tournament.slug]);
  }
}
