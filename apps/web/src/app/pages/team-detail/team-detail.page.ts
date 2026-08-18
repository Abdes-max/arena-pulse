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
import { MatchCard, MatchCardTeam, MatchCardVariant } from 'design-system';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import { TournamentContextService } from '../../core/tournament-context.service';
import { PublicTeamDetail, RoundLabelLang, roundLabel } from 'shared-models';

@Component({
  selector: 'app-team-detail-page',
  imports: [DecimalPipe, MatchCard, TranslocoPipe],
  templateUrl: './team-detail.page.html',
  styleUrl: './team-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  protected readonly assetUrl = inject(AssetUrlService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  protected readonly language = this.languageService.language;

  protected readonly loading = signal(true);
  // A Transloco *key*, not the translated text -- see tournament-shell.ts's
  // identical errorMessage for why (stays reactive to a language switch).
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
    effect(() => {
      if (this.context.lastMatchEvent()) {
        void this.load();
      }
    });
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    const teamId = this.route.snapshot.paramMap.get('teamId')!;
    this.loading.set(true);
    try {
      this.team.set(await this.api.getTeam(slug, teamId));
    } catch {
      this.errorMessage.set('teamDetail.loadError');
    } finally {
      this.loading.set(false);
    }
  }

  protected variantFor(match: PublicTeamDetail['matches'][number]): MatchCardVariant {
    return match.status === 'LIVE' ? 'live' : 'result';
  }

  // Resolves the logo's relative API path into a URL fetchable from
  // wherever this app is actually running -- see AssetUrlService.
  protected teamCardInput(
    team: { name: string; logoUrl: string | null } | null,
    fallbackLabel: string,
  ): MatchCardTeam {
    return team
      ? { name: team.name, logoUrl: this.assetUrl.resolve(team.logoUrl) }
      : { name: fallbackLabel };
  }

  protected formatKickoff(startTime: string): string {
    return new Date(startTime).toLocaleString(this.language(), {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  protected competitionLabel(match: PublicTeamDetail['matches'][number]): string {
    const lang = this.language() as RoundLabelLang;
    if (match.isThirdPlaceMatch) {
      return this.transloco.translate('home.competition.thirdPlace', {}, lang);
    }
    if (match.knockoutBracketId && match.knockoutTotalRounds !== null) {
      return roundLabel(match.knockoutTotalRounds - match.round, lang);
    }
    return this.transloco.translate('teamDetail.poolRound', { round: match.round }, lang);
  }
}
