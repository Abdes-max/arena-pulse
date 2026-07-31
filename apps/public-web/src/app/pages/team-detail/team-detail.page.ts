import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatchCard } from 'design-system';
import { PublicApiService } from '../../core/public-api.service';
import { TournamentContextService } from '../../core/tournament-context.service';
import { PublicTeamDetail } from '../../core/models';

@Component({
  selector: 'app-team-detail-page',
  imports: [MatchCard],
  templateUrl: './team-detail.page.html',
  styleUrl: './team-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly team = signal<PublicTeamDetail | null>(null);

  private readonly isDecided = (match: PublicTeamDetail['matches'][number]) =>
    match.score !== null || match.status === 'FORFEITED';

  protected readonly playedMatches = computed(
    () => this.team()?.matches.filter((match) => this.isDecided(match)) ?? [],
  );
  protected readonly upcomingMatches = computed(
    () => this.team()?.matches.filter((match) => !this.isDecided(match)) ?? [],
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    const teamId = this.route.snapshot.paramMap.get('teamId')!;
    this.loading.set(true);
    try {
      this.team.set(await this.api.getTeam(slug, teamId));
    } catch {
      this.errorMessage.set('Impossible de charger cette équipe.');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatKickoff(startTime: string): string {
    return new Date(startTime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected competitionLabel(match: PublicTeamDetail['matches'][number]): string {
    if (match.isThirdPlaceMatch) {
      return 'Match pour la 3e place';
    }
    if (match.knockoutBracketId) {
      return 'Phase finale';
    }
    return `Poule — round ${match.round}`;
  }
}
