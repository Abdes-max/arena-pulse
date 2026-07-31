import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { PublicApiService } from 'api-client';
import {
  IonBadge,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { Category, CompetitionPhase, Match } from 'shared-models';
import { TournamentContextService } from '../../core/tournament-context.service';

@Component({
  selector: 'app-schedule-page',
  imports: [
    IonContent,
    IonSelect,
    IonSelectOption,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonBadge,
  ],
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

  protected readonly matchesByDay = computed(() => {
    const days = new Map<string, { label: string; matches: Match[] }>();
    const sorted = [...this.matches()].sort((a, b) => {
      const aTime = a.timeSlot?.startTime ?? '';
      const bTime = b.timeSlot?.startTime ?? '';
      return aTime.localeCompare(bTime);
    });
    for (const match of sorted) {
      if (!match.timeSlot) {
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
    return [...days.values()];
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

  protected statusLabel(match: Match): string {
    if (match.status === 'LIVE') {
      return 'EN DIRECT';
    }
    if (match.status === 'FORFEITED') {
      return 'FORFAIT';
    }
    return match.score ? 'TERMINÉ' : 'À VENIR';
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
