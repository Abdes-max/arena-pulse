import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { PublicApiService } from 'api-client';
import { Logo, TextField, TournamentCard, TournamentMarquee } from 'design-system';
import { PublicTournamentSummary } from 'shared-models';

@Component({
  selector: 'app-tournament-entry-page',
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonButton,
    Logo,
    TextField,
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

  protected readonly slug = signal('');
  protected readonly tournaments = signal<PublicTournamentSummary[]>([]);
  protected readonly query = signal('');

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

  protected onSlugChange(value: string): void {
    this.slug.set(value);
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
  }

  protected go(): void {
    const slug = this.slug().trim();
    if (slug) {
      void this.router.navigate(['/', slug]);
    }
  }

  protected goToTournament(tournament: PublicTournamentSummary): void {
    void this.router.navigate(['/', tournament.slug]);
  }
}
