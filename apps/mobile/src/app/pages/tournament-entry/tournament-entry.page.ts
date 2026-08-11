import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { PublicApiService } from 'api-client';
import { Logo, TextField, TournamentCard } from 'design-system';
import { PublicTournamentSummary } from 'shared-models';

@Component({
  selector: 'app-tournament-entry-page',
  imports: [IonContent, IonButton, Logo, TextField, TournamentCard],
  templateUrl: './tournament-entry.page.html',
  styleUrl: './tournament-entry.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentEntryPage {
  private readonly router = inject(Router);
  private readonly api = inject(PublicApiService);

  protected readonly slug = signal('');
  protected readonly tournaments = signal<PublicTournamentSummary[]>([]);

  constructor() {
    void this.api.listTournaments(8).then((tournaments) => this.tournaments.set(tournaments));
  }

  protected onSlugChange(value: string): void {
    this.slug.set(value);
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
