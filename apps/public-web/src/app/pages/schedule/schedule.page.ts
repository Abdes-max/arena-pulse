import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatchCard } from 'design-system';
import { PublicApiService } from '../../core/public-api.service';
import { TournamentContextService } from '../../core/tournament-context.service';
import { Category, CompetitionPhase, Match } from '../../core/models';

@Component({
  selector: 'app-schedule-page',
  imports: [MatchCard],
  templateUrl: './schedule.page.html',
  styleUrl: './schedule.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);

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
      const key = date.toISOString().slice(0, 10);
      const entry = days.get(key) ?? {
        label: date.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
        matches: [],
      };
      entry.matches.push(match);
      days.set(key, entry);
    }
    return {
      days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, day]) => day),
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

  protected async onCategoryChange(event: Event): Promise<void> {
    this.selectedCategoryId.set((event.target as HTMLSelectElement).value);
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

  protected async onPhaseChange(event: Event): Promise<void> {
    this.selectedPhaseId.set((event.target as HTMLSelectElement).value);
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

  protected onQueryChange(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected formatKickoff(startTime: string): string {
    return new Date(startTime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected competitionLabel(match: Match): string {
    if (match.isThirdPlaceMatch) {
      return 'Match pour la 3e place';
    }
    if (match.knockoutBracketId) {
      return 'Phase finale';
    }
    return `Round ${match.round}`;
  }
}
