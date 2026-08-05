import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { MatchCard } from 'design-system';
import { PublicApiService } from 'api-client';
import { Category, Match } from 'shared-models';
import { TournamentContextService } from '../../core/tournament-context.service';

/** Mirrors apps/web's home.page.ts (the "Tournoi" tab's content). */
@Component({
  selector: 'app-home-page',
  imports: [IonContent, MatchCard],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly api = inject(PublicApiService);
  protected readonly context = inject(TournamentContextService);

  protected readonly tournament = this.context.tournament;
  protected readonly categories = signal<Category[]>([]);
  protected readonly upcomingMatches = signal<Match[]>([]);

  constructor() {
    void this.load();
    effect(() => {
      if (this.context.lastMatchEvent()) {
        void this.api
          .listUpcomingMatches(this.context.slug(), 3)
          .then((matches) => this.upcomingMatches.set(matches));
      }
    });
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    if (!slug) {
      return;
    }
    this.categories.set(await this.api.listCategories(slug));
    this.upcomingMatches.set(await this.api.listUpcomingMatches(slug, 3));
  }

  protected formatKickoff(startTime: string): string {
    return new Date(startTime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected competitionLabel(match: Match): string {
    if (match.isThirdPlaceMatch) {
      return 'Match pour la 3e place';
    }
    if (match.knockoutBracketId) {
      return 'Phase finale';
    }
    return `Round ${match.round}`;
  }
}
