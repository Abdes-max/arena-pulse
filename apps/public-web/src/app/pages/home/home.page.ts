import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatchCard } from 'design-system';
import { PublicApiService } from '../../core/public-api.service';
import { TournamentContextService } from '../../core/tournament-context.service';
import { Category, Match } from '../../core/models';

@Component({
  selector: 'app-home-page',
  imports: [MatchCard],
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
    const slug = this.context.slug();
    if (slug) {
      void this.api.listCategories(slug).then((categories) => this.categories.set(categories));
      void this.api
        .listUpcomingMatches(slug, 3)
        .then((matches) => this.upcomingMatches.set(matches));
    }
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
