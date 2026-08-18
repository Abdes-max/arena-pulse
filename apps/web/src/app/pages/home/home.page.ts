import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatchCard, MatchCardTeam } from 'design-system';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import { TournamentContextService } from '../../core/tournament-context.service';
import { Category, Match } from 'shared-models';

@Component({
  selector: 'app-home-page',
  imports: [MatchCard, TranslocoPipe],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly api = inject(PublicApiService);
  protected readonly context = inject(TournamentContextService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

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
    return new Date(startTime).toLocaleString(this.languageService.language(), {
      dateStyle: 'short',
      timeStyle: 'short',
    });
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

  protected logoUrl(url: string | null): string | null {
    return this.assetUrl.resolve(url);
  }

  protected competitionLabel(match: Match): string {
    const lang = this.languageService.language();
    if (match.isThirdPlaceMatch) {
      return this.transloco.translate('home.competition.thirdPlace', {}, lang);
    }
    if (match.knockoutBracketId) {
      return this.transloco.translate('home.competition.final', {}, lang);
    }
    return this.transloco.translate('home.competition.round', { round: match.round }, lang);
  }
}
