import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AssetUrlService, PublicApiService } from 'api-client';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { MatchCard, MatchCardTeam, MatchCardVariant } from 'design-system';
import { PublicTeamDetail, roundLabel } from 'shared-models';
import { FavoritesService } from '../../core/favorites.service';
import { OfflineCacheService } from '../../core/offline-cache.service';
import { TournamentContextService } from '../../core/tournament-context.service';

@Component({
  selector: 'app-team-detail-page',
  imports: [DecimalPipe, IonContent, MatchCard, IonButton],
  templateUrl: './team-detail.page.html',
  styleUrl: './team-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  protected readonly favorites = inject(FavoritesService);
  protected readonly cache = inject(OfflineCacheService);
  protected readonly assetUrl = inject(AssetUrlService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly team = signal<PublicTeamDetail | null>(null);
  protected readonly cachedAt = signal<number | null>(null);

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
    effect(() => {
      if (this.context.lastMatchEvent()) {
        void this.load();
      }
    });
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    const teamId = this.route.snapshot.paramMap.get('teamId')!;
    const cacheKey = `team:${slug}:${teamId}`;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const team = await this.api.getTeam(slug, teamId);
      this.team.set(team);
      this.cachedAt.set(null);
      this.cache.set(cacheKey, team);
    } catch (error) {
      const cached = this.cache.get<PublicTeamDetail>(cacheKey);
      if (this.cache.isNetworkFailure(error) && cached) {
        this.team.set(cached.data);
        this.cachedAt.set(cached.cachedAt);
      } else {
        this.errorMessage.set('Impossible de charger cette équipe.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected retry(): void {
    void this.load();
  }

  protected isFavorite(): boolean {
    const team = this.team();
    return team ? this.favorites.isFavorite(this.context.slug(), team.id) : false;
  }

  protected toggleFavorite(): void {
    const team = this.team();
    if (team) {
      this.favorites.toggle(this.context.slug(), team.id, team.name);
    }
  }

  // Mirrors web's team-detail.page.ts variantFor exactly -- used for the
  // "Joués" list only; "À venir" always shows variant="upcoming" regardless
  // of status, same as web's hardcoded value there.
  protected variantFor(match: PublicTeamDetail['matches'][number]): MatchCardVariant {
    return match.status === 'LIVE' ? 'live' : 'result';
  }

  // Resolves the logo's relative API path into a URL fetchable from
  // wherever this app is actually running -- see AssetUrlService (mobile
  // runs on a different Capacitor origin than the API, unlike web).
  protected teamCardInput(
    team: { name: string; logoUrl: string | null } | null,
    fallbackLabel: string,
  ): MatchCardTeam {
    return team
      ? { name: team.name, logoUrl: this.assetUrl.resolve(team.logoUrl) }
      : { name: fallbackLabel };
  }

  protected formatKickoff(startTime: string): string {
    return new Date(startTime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected competitionLabel(match: PublicTeamDetail['matches'][number]): string {
    if (match.isThirdPlaceMatch) {
      return 'Match pour la 3e place';
    }
    if (match.knockoutBracketId && match.knockoutTotalRounds !== null) {
      return roundLabel(match.knockoutTotalRounds - match.round);
    }
    return `Poule — round ${match.round}`;
  }
}
