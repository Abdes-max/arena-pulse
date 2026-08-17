import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { PublicApiService } from 'api-client';
import { Logo, TextField, ThemeModeToggle, TournamentCard, TournamentMarquee } from 'design-system';
import { ThemeMode, ThemeService } from 'design-tokens';
import { PublicTournamentSummary } from 'shared-models';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-tournament-entry-page',
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    Logo,
    TextField,
    ThemeModeToggle,
    TournamentCard,
    TournamentMarquee,
  ],
  templateUrl: './tournament-entry.page.html',
  styleUrl: './tournament-entry.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentEntryPage {
  private readonly router = inject(Router);
  private readonly api = inject(PublicApiService);
  private readonly themeService = inject(ThemeService);

  protected readonly tournaments = signal<PublicTournamentSummary[]>([]);
  protected readonly query = signal('');
  // Governs everything below the hero, same as apps/web's landing.page --
  // the hero itself stays forced dark regardless (data-mode="dark" scoped
  // on tournament-entry-page__hero in the template).
  protected readonly mode = this.themeService.mode;

  // There's no admin UI or tournament-creation flow in this app -- both
  // buttons below just hand off to the web app, same as apps/web's landing
  // page hero ("Créer mon tournoi"/"Voir un exemple en direct").
  protected readonly createTournamentUrl = `${environment.webUrl}/register`;
  protected readonly loginUrl = `${environment.webUrl}/login`;
  protected readonly exampleTournament = computed(() => this.tournaments()[0] ?? null);

  // Same pattern as apps/web's LandingPage (and team-search.page's
  // filteredTeams) -- client-side filter over a wider-than-displayed fetch.
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
