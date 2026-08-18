import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatchCard, MatchCardTeam, MatchCardVariant, Tabs, TextField } from 'design-system';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import { TournamentContextService } from '../../core/tournament-context.service';
import { Category, CompetitionPhase, Match, RoundLabelLang, roundLabel } from 'shared-models';

@Component({
  selector: 'app-schedule-page',
  imports: [MatchCard, Tabs, TextField, TranslocoPipe],
  templateUrl: './schedule.page.html',
  styleUrl: './schedule.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly loading = signal(true);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedPhaseId = signal('');
  protected readonly matches = signal<Match[]>([]);
  protected readonly query = signal('');

  protected readonly matchesByDay = computed(() => {
    const days = new Map<string, { label: string; matches: Match[] }>();
    const unscheduled: Match[] = [];
    for (const match of this.filteredMatches()) {
      if (!match.timeSlot) {
        unscheduled.push(match);
        continue;
      }
      const date = new Date(match.timeSlot.startTime);
      // Local calendar day, matching the locale-formatted label below and
      // each match's own displayed kickoff time (formatKickoff) — using the
      // UTC day here would split/merge matches inconsistently with what's
      // shown on screen whenever a match falls near local midnight.
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const entry = days.get(key) ?? {
        label: date.toLocaleDateString(this.languageService.language(), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
        matches: [],
      };
      entry.matches.push(match);
      days.set(key, entry);
    }
    // filteredMatches() is already chronologically sorted, so insertion
    // order into the Map already reflects day order — no extra sort needed
    // (and a string sort on the "year-month-day" key above would be wrong
    // since it isn't zero-padded).
    return {
      days: [...days.values()],
      unscheduled,
    };
  });

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

  protected readonly categoryOptions = computed(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );

  protected readonly phaseOptions = computed(() =>
    this.phases().map((phase) => ({ value: phase.id, label: phase.name })),
  );

  // matches() only ever holds one phase's matches at a time (the currently
  // selected category+phase tabs), so a single bracket size covers all of
  // them -- see competitionLabel below.
  private readonly selectedPhaseTotalRounds = computed(() => {
    const phase = this.phases().find((p) => p.id === this.selectedPhaseId());
    return phase?.knockoutBracket ? Math.log2(phase.knockoutBracket.size) : null;
  });

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

  protected onQueryChange(query: string): void {
    this.query.set(query);
  }

  protected variantFor(match: Match): MatchCardVariant {
    if (match.status === 'LIVE') {
      return 'live';
    }
    return match.score ? 'result' : 'upcoming';
  }

  protected formatKickoff(startTime: string): string {
    return new Date(startTime).toLocaleString(this.languageService.language(), {
      dateStyle: 'short',
      timeStyle: 'short',
    });
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
    const lang = this.languageService.language() as RoundLabelLang;
    if (match.isThirdPlaceMatch) {
      return this.transloco.translate('home.competition.thirdPlace', {}, lang);
    }
    const totalRounds = this.selectedPhaseTotalRounds();
    if (match.knockoutBracketId && totalRounds !== null) {
      return roundLabel(totalRounds - match.round, lang);
    }
    return this.transloco.translate('home.competition.round', { round: match.round }, lang);
  }
}
