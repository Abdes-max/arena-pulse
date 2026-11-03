import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Badge, Button, MatchCard, MatchCardTeam, MatchCardVariant } from 'design-system';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import { FavoritesService } from '../../core/favorites.service';
import { TournamentContextService } from '../../core/tournament-context.service';
import {
  CompetitionPhase,
  PublicTeamDetail,
  Qualification,
  QualificationTierColor,
  RoundLabelLang,
  roundLabel,
  qualificationTierColor,
  Standings,
} from 'shared-models';

@Component({
  selector: 'app-team-detail-page',
  imports: [Badge, Button, DecimalPipe, MatchCard, RouterLink, TranslocoPipe],
  templateUrl: './team-detail.page.html',
  styleUrl: './team-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  private readonly favorites = inject(FavoritesService);
  protected readonly assetUrl = inject(AssetUrlService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  protected readonly language = this.languageService.language;

  protected readonly loading = signal(true);
  // A Transloco *key*, not the translated text -- see tournament-shell.ts's
  // identical errorMessage for why (stays reactive to a language switch).
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly team = signal<PublicTeamDetail | null>(null);
  protected readonly groupStandings = signal<Standings | null>(null);
  private readonly qualifications = signal<Qualification[]>([]);
  private readonly phases = signal<CompetitionPhase[]>([]);

  // Same rules as the Classement page (standings.page.ts): a plain
  // "Qualifié" badge with a single knockout tier, a colored per-tier label
  // (e.g. "Ligue des Champions") once there are several.
  private readonly tierPhases = computed(() =>
    this.phases()
      .filter((phase) => phase.type === 'KNOCKOUT')
      .sort((a, b) => a.position - b.position),
  );
  protected readonly hasSeveralTiers = computed(() => this.tierPhases().length >= 2);

  protected isQualified(teamId: string): boolean {
    return this.qualifications().some((qualification) =>
      qualification.qualifiedTeams.some((team) => team.id === teamId),
    );
  }

  protected qualificationTier(teamId: string): (QualificationTierColor & { label: string }) | null {
    if (!this.hasSeveralTiers()) {
      return null;
    }
    const qualification = this.qualifications().find((qual) =>
      qual.qualifiedTeams.some((team) => team.id === teamId),
    );
    if (!qualification) {
      return null;
    }
    const tiers = this.tierPhases();
    const index = tiers.findIndex((phase) => phase.id === qualification.targetPhaseId);
    return index >= 0
      ? { label: qualification.targetPhaseName, ...qualificationTierColor(index, tiers.length) }
      : null;
  }

  protected readonly isFavorite = computed(() => {
    const team = this.team();
    return team ? this.favorites.isFavorite(this.context.slug(), team.id) : false;
  });

  /** "Toutes les équipes": the list once, without bouncing back to the favorite team. */
  protected readonly teamsLink = computed(() => ['/', this.context.slug(), 'team']);

  protected showTeamList(): void {
    this.favorites.showTeamListOnce();
  }

  protected toggleFavorite(): void {
    const team = this.team();
    if (team) {
      this.favorites.toggle(this.context.slug(), team.id, team.name);
    }
  }

  private readonly isDecided = (match: PublicTeamDetail['matches'][number]) =>
    match.score !== null || match.status === 'FORFEITED';

  protected readonly playedMatches = computed(
    () => this.team()?.matches.filter((match) => this.isDecided(match)) ?? [],
  );
  protected readonly upcomingMatches = computed(
    () => this.team()?.matches.filter((match) => !this.isDecided(match)) ?? [],
  );

  // Same highlight as the home page's "Prochains matchs": every match tied
  // for the earliest kickoff is featured, the rest stay compact.
  protected isFeatured(match: PublicTeamDetail['matches'][number]): boolean {
    const earliest = this.upcomingMatches()[0]?.timeSlot?.startTime;
    return earliest !== undefined && match.timeSlot?.startTime === earliest;
  }

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
      const team = await this.api.getTeam(slug, teamId);
      this.team.set(team);
      // The whole pool's table, so the team's numbers read in context (its
      // row is highlighted) -- a failure here just falls back to the
      // team's own figures, it never blanks the page.
      const groupId = team.groupId;
      const [standings, qualifications, phases] = groupId
        ? await Promise.all([
            this.api.getStandings(slug, groupId).catch(() => null),
            // Qualification badges are a bonus on top of the table -- never
            // a reason to drop it.
            this.api.getQualifications(slug, groupId).catch(() => []),
            this.api.listPhases(slug, team.categoryId).catch(() => []),
          ])
        : [null, [], []];
      this.groupStandings.set(standings);
      this.qualifications.set(qualifications);
      this.phases.set(phases);
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
