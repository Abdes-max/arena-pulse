import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssetUrlService, PublicApiService } from 'api-client';
import { LanguageService } from 'design-tokens';
import { CompetitionGroup, Match, Standings } from 'shared-models';
import { TournamentContextService } from '../../core/tournament-context.service';
import { groupRotations, pickCurrentAndNext } from './tv-rotations';

interface GroupStandings {
  group: CompetitionGroup;
  standings: Standings;
}

const REFRESH_MS = 60_000;

/**
 * Full-screen "écran TV" for the clubhouse: current and next rotation on the
 * left, pool standings on the right. Lives outside TournamentShell (no
 * header/nav) and refreshes on every SSE match event plus once a minute, so
 * "current" also moves on by itself as kickoff times pass.
 */
@Component({
  selector: 'app-tv-page',
  imports: [TranslocoPipe],
  templateUrl: './tv.page.html',
  styleUrl: './tv.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TournamentContextService],
})
export class TvPage {
  private readonly api = inject(PublicApiService);
  protected readonly assetUrl = inject(AssetUrlService);
  private readonly context = inject(TournamentContextService);
  private readonly languageService = inject(LanguageService);
  private readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';

  protected readonly tournament = this.context.tournament;
  protected readonly errorMessage = this.context.errorMessage;
  protected readonly matches = signal<Match[]>([]);
  protected readonly groupStandings = signal<GroupStandings[]>([]);
  protected readonly now = signal(new Date());

  protected readonly picked = computed(() =>
    pickCurrentAndNext(groupRotations(this.matches()), this.now()),
  );
  protected readonly publicUrl = computed(() => `${window.location.host}/${this.slug}`);

  constructor() {
    void this.context.load(this.slug).then(() => this.refresh());

    const timer = setInterval(() => {
      this.now.set(new Date());
      void this.refresh();
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    effect(() => {
      if (this.context.lastMatchEvent()) {
        untracked(() => void this.refresh());
      }
    });
  }

  private async refresh(): Promise<void> {
    if (!this.tournament()) {
      return;
    }
    try {
      const categories = await this.api.listCategories(this.slug);
      const phases = (
        await Promise.all(categories.map((category) => this.api.listPhases(this.slug, category.id)))
      )
        .flat()
        .filter((phase) => !phase.isSeedPhase);
      const [matchLists, standings] = await Promise.all([
        Promise.all(phases.map((phase) => this.api.listPhaseMatches(this.slug, phase.id))),
        Promise.all(
          phases
            .flatMap((phase) => phase.groups)
            .map(async (group) => ({
              group,
              standings: await this.api.getStandings(this.slug, group.id),
            })),
        ),
      ]);
      this.matches.set(matchLists.flat());
      this.groupStandings.set(standings);
      this.now.set(new Date());
    } catch {
      // Keep showing the last good data -- a TV left on all day shouldn't
      // blank out on a transient network hiccup.
    }
  }

  protected formatClock(time: string | Date): string {
    return new Date(time).toLocaleTimeString(this.languageService.language(), {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected teamName(team: Match['homeTeam'], sourceLabel: string | null): string {
    return team?.name ?? sourceLabel ?? '?';
  }

  protected scoreOf(match: Match): string {
    return match.score ? `${match.score.homeScore} – ${match.score.awayScore}` : '–';
  }
}
