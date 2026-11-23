import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  computed,
} from '@angular/core';
import { MatchCard, MatchCardTeam } from 'design-system';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import { TournamentContextService } from '../../core/tournament-context.service';
import { Match, PublicTournament, PublicRegistrationInfo, StandingRow } from 'shared-models';
import { AuthService } from '../../admin/core/auth.service';

@Component({
  selector: 'app-home-page',
  imports: [MatchCard, RouterLink, TranslocoPipe],
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
  protected readonly player = inject(AuthService).currentUser;

  protected readonly tournament = this.context.tournament;
  // Venue (moved to the shell header) and categories (same) are no longer
  // this page's own concern -- both now live on TournamentContextService,
  // shared across every tab.
  protected readonly upcomingMatches = signal<Match[]>([]);
  /** The last scored matches, newest first (first category's pool phase). */
  protected readonly recentResults = signal<Match[]>([]);
  /** That pool's table, shown beside the results. */
  protected readonly standings = signal<{ group: string; rows: StandingRow[] } | null>(null);

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

  /** Recent results and the first pool's table -- best effort, both optional. */
  private async loadResults(slug: string): Promise<void> {
    try {
      const [category] = await this.api.listCategories(slug);
      if (!category) {
        return;
      }
      const phases = await this.api.listPhases(slug, category.id);
      const pool = phases.find((p) => p.type === 'GROUP_STAGE' && !p.isSeedPhase);
      if (!pool) {
        return;
      }
      const matches = await this.api.listPhaseMatches(slug, pool.id);
      this.recentResults.set(
        matches
          .filter((m) => m.score && m.homeTeam && m.awayTeam)
          .sort((a, b) => (b.timeSlot?.startTime ?? '').localeCompare(a.timeSlot?.startTime ?? ''))
          .slice(0, 4),
      );
      const group = pool.groups[0];
      if (group) {
        const table = await this.api.getStandings(slug, group.id);
        if (table.rows.some((row) => row.played > 0)) {
          this.standings.set({ group: group.name, rows: table.rows.slice(0, 6) });
        }
      }
    } catch {
      // Nothing more to show then.
    }
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    if (!slug) {
      return;
    }
    this.upcomingMatches.set(await this.api.listUpcomingMatches(slug, 3));
    void this.loadResults(slug);
    try {
      this.registration.set(await this.api.getRegistrationInfo(slug));
    } catch {
      // No registration block then.
    }
    if (this.player()) {
      try {
        const mine = await this.api.listMyRegistrations();
        this.myTeams.set(
          mine.filter(
            (r) =>
              r.tournament.slug === slug && r.status !== 'REJECTED' && r.status !== 'CANCELLED',
          ).length,
        );
      } catch {
        this.myTeams.set(0);
      }
    }
  }

  /** Pre-registrations of this tournament (shown while they're open). */
  protected readonly registration = signal<PublicRegistrationInfo | null>(null);
  // Teams the signed-in manager already registered here ("Déjà inscrit").
  protected readonly myTeams = signal(0);
  protected readonly canRegisterMore = computed(
    () => this.myTeams() < (this.registration()?.maxTeamsPerRegistrant ?? 1),
  );

  protected formatFee(cents: number | null, currency: string): string | null {
    return cents
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
      : null;
  }

  // Whether the main "aperçu" column (online notice and/or description) has
  // anything to show -- the venue card that used to live here moved to the
  // shell header, so a tournament with a physical venue and no description
  // now has nothing for this column.
  protected hasOverviewMain(t: PublicTournament): boolean {
    return !!t.description || (t.venues.length === 0 && t.isOnline);
  }

  // Whether the poster side column has anything to show -- used both to
  // gate that column and to collapse the section to a single column when
  // only one of the two sides has content (see home.page.scss).
  protected hasPoster(t: PublicTournament): boolean {
    return !!this.logoUrl(t.posterUrl);
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
