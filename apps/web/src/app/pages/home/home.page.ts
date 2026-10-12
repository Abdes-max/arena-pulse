import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatchCard, MatchCardTeam } from 'design-system';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import { TournamentContextService } from '../../core/tournament-context.service';
import { Match, PublicTournament } from 'shared-models';

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
  // Venue (moved to the shell header) and categories (same) are no longer
  // this page's own concern -- both now live on TournamentContextService,
  // shared across every tab.
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
    this.upcomingMatches.set(await this.api.listUpcomingMatches(slug, 3));
  }

  // Whether the "aperçu" side column (online notice / poster) has anything
  // to show -- the venue card that used to live here moved to the shell
  // header, so a tournament with a physical venue and no poster now has
  // nothing for this column, and the section should collapse to a single
  // column instead of leaving an empty one (see home.page.scss).
  protected hasOverviewSide(t: PublicTournament): boolean {
    return (t.venues.length === 0 && t.isOnline) || !!this.logoUrl(t.posterUrl);
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

  // Featured highlight goes to every match tied for the earliest kickoff,
  // not just the first one in the list -- a plateau round routinely starts
  // several matches at the same time on different fields.
  protected isFeatured(match: Match): boolean {
    const earliest = this.upcomingMatches()[0]?.timeSlot?.startTime;
    return earliest !== undefined && match.timeSlot?.startTime === earliest;
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
