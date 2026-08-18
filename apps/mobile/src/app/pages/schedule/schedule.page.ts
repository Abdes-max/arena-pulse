import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { AssetUrlService, PublicApiService } from 'api-client';
import { IonContent, IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';
import { MatchCard, MatchCardTeam, MatchCardVariant, TextField } from 'design-system';
import { Category, CompetitionPhase, Match, roundLabel } from 'shared-models';
import { TournamentContextService } from '../../core/tournament-context.service';

@Component({
  selector: 'app-schedule-page',
  imports: [IonContent, IonSegment, IonSegmentButton, IonLabel, MatchCard, TextField],
  templateUrl: './schedule.page.html',
  styleUrl: './schedule.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly loading = signal(true);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedPhaseId = signal('');
  protected readonly matches = signal<Match[]>([]);
  protected readonly query = signal('');

  protected readonly filteredMatches = computed(() => {
    const query = this.query().trim().toLowerCase();
    const sorted = [...this.matches()].sort((a, b) => {
      const aTime = a.timeSlot?.startTime ?? '';
      const bTime = b.timeSlot?.startTime ?? '';
      return aTime.localeCompare(bTime);
    });
    if (!query) {
      return sorted;
    }
    return sorted.filter(
      (match) =>
        match.homeTeam?.name.toLowerCase().includes(query) ||
        match.awayTeam?.name.toLowerCase().includes(query) ||
        match.officials.some((official) =>
          (official.referee
            ? `${official.referee.firstName} ${official.referee.lastName}`
            : (official.refereeingTeam?.name ?? '')
          )
            .toLowerCase()
            .includes(query),
        ),
    );
  });

  protected readonly matchesByDay = computed(() => {
    const days = new Map<string, { label: string; matches: Match[] }>();
    // Matches with no time slot yet (e.g. a knockout round not yet
    // scheduled) used to be silently dropped here instead of shown -- same
    // fix as public-web's schedule.page.ts, which surfaces these under
    // their own "Non planifié" section rather than hiding them.
    const unscheduled: Match[] = [];
    for (const match of this.filteredMatches()) {
      if (!match.timeSlot) {
        unscheduled.push(match);
        continue;
      }
      const date = new Date(match.timeSlot.startTime);
      // Local calendar day — see docs/architecture in public-web's schedule.page.ts
      // for why UTC-day grouping would misfile matches near local midnight.
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const entry = days.get(key) ?? {
        label: date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        matches: [],
      };
      entry.matches.push(match);
      days.set(key, entry);
    }
    return { days: [...days.values()], unscheduled };
  });

  constructor() {
    void this.loadCategories();
    effect(() => {
      if (this.context.lastMatchEvent()) {
        void this.loadMatches();
      }
    });
  }

  private async loadCategories(): Promise<void> {
    const slug = this.context.slug();
    this.loading.set(true);
    try {
      const categories = await this.api.listCategories(slug);
      this.categories.set(categories);
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadPhases();
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadPhases();
  }

  private async loadPhases(): Promise<void> {
    const slug = this.context.slug();
    const categoryId = this.selectedCategoryId();
    const phases = await this.api.listPhases(slug, categoryId);
    this.phases.set(phases);
    if (phases.length > 0) {
      this.selectedPhaseId.set(phases[0].id);
      await this.loadMatches();
    } else {
      this.selectedPhaseId.set('');
      this.matches.set([]);
    }
  }

  protected async onPhaseChange(phaseId: string): Promise<void> {
    this.selectedPhaseId.set(phaseId);
    await this.loadMatches();
  }

  // matches() only ever holds one phase's matches at a time (the currently
  // selected category+phase tabs), so a single bracket size covers all of
  // them -- see competitionLabel below.
  private readonly selectedPhaseTotalRounds = computed(() => {
    const phase = this.phases().find((p) => p.id === this.selectedPhaseId());
    return phase?.knockoutBracket ? Math.log2(phase.knockoutBracket.size) : null;
  });

  // ion-segment's ionChange event types its value as SegmentValue (string |
  // number) | undefined, even though every value bound here is a string id.
  protected asString(value: string | number | undefined): string {
    return String(value ?? '');
  }

  protected onQueryChange(query: string): void {
    this.query.set(query);
  }

  private async loadMatches(): Promise<void> {
    const slug = this.context.slug();
    const phase = this.phases().find((p) => p.id === this.selectedPhaseId());
    if (!phase) {
      return;
    }
    this.matches.set(
      phase.knockoutBracket
        ? await this.api.listBracketMatches(slug, phase.knockoutBracket.id)
        : await this.api.listPhaseMatches(slug, phase.id),
    );
  }

  // ap-match-card is the shared design-system component web already uses
  // here (card box, background, badge) -- not a mobile-specific ion-item
  // row, so both platforms render matches identically.
  protected variantFor(match: Match): MatchCardVariant {
    if (match.status === 'LIVE') {
      return 'live';
    }
    return match.score ? 'result' : 'upcoming';
  }

  protected formatKickoff(startTime: string): string {
    return new Date(startTime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected teamCardInput(
    team: { name: string; logoUrl: string | null } | null,
    fallbackLabel: string | null,
  ): MatchCardTeam {
    return team
      ? { name: team.name, logoUrl: this.assetUrl.resolve(team.logoUrl) }
      : { name: fallbackLabel ?? '?' };
  }

  protected competitionLabel(match: Match): string {
    if (match.isThirdPlaceMatch) {
      return 'Match pour la 3e place';
    }
    const totalRounds = this.selectedPhaseTotalRounds();
    if (match.knockoutBracketId && totalRounds !== null) {
      return roundLabel(totalRounds - match.round);
    }
    return `Round ${match.round}`;
  }
}
