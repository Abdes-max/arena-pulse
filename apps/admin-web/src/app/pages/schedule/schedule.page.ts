import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Button } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import { Category, CompetitionPhase, Match, MatchOfficial, Venue } from '../../core/models';
import { ScheduleService } from '../../core/schedule.service';
import { TournamentsService } from '../../core/tournaments.service';

@Component({
  selector: 'app-schedule-page',
  imports: [Button],
  templateUrl: './schedule.page.html',
  styleUrl: './schedule.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly competitionFormatsService = inject(CompetitionFormatsService);
  private readonly scheduleService = inject(ScheduleService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly generating = signal(false);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedPhaseId = signal('');
  protected readonly venues = signal<Venue[]>([]);
  protected readonly matches = signal<Match[]>([]);

  protected readonly selectedFieldIds = signal<string[]>([]);
  protected readonly startDateTime = signal('');
  protected readonly matchDurationMinutes = signal('');
  protected readonly breakDurationMinutes = signal('');
  protected readonly refereesPerMatch = signal('');

  protected readonly groupStagePhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'GROUP_STAGE'),
  );

  protected readonly matchesByField = computed(() => {
    const groups = new Map<string, { fieldName: string; matches: Match[] }>();
    for (const match of this.matches()) {
      const field = match.timeSlot?.field;
      const key = field?.id ?? 'unscheduled';
      const entry = groups.get(key) ?? {
        fieldName: field?.name ?? 'Non planifié',
        matches: [],
      };
      entry.matches.push(match);
      groups.set(key, entry);
    }
    return [...groups.values()];
  });

  constructor() {
    void this.loadCategories();
  }

  private async loadCategories(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const [categories, venues] = await Promise.all([
        this.tournamentsService.listCategories(organizationId, this.tournamentId),
        this.tournamentsService.listVenues(organizationId, this.tournamentId),
      ]);
      this.categories.set(categories);
      this.venues.set(venues);
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadPhases();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les catégories.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onCategoryChange(event: Event): Promise<void> {
    this.selectedCategoryId.set((event.target as HTMLSelectElement).value);
    await this.loadPhases();
  }

  private async loadPhases(): Promise<void> {
    const organizationId = this.organization()?.id;
    const categoryId = this.selectedCategoryId();
    if (!organizationId || !categoryId) {
      return;
    }
    this.selectedPhaseId.set('');
    this.matches.set([]);
    try {
      const phases = await this.competitionFormatsService.listPhases(
        organizationId,
        this.tournamentId,
        categoryId,
      );
      this.phases.set(phases);
      const firstGroupStage = phases.find((phase) => phase.type === 'GROUP_STAGE');
      if (firstGroupStage) {
        this.selectedPhaseId.set(firstGroupStage.id);
        await this.onPhaseSelected();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les phases.');
    }
  }

  protected async onPhaseChange(event: Event): Promise<void> {
    this.selectedPhaseId.set((event.target as HTMLSelectElement).value);
    await this.onPhaseSelected();
  }

  private async onPhaseSelected(): Promise<void> {
    const phase = this.phases().find((p) => p.id === this.selectedPhaseId());
    if (phase) {
      this.matchDurationMinutes.set(String(phase.matchDurationMinutes));
      this.breakDurationMinutes.set(String(phase.breakDurationMinutes));
      this.refereesPerMatch.set(String(phase.refereesPerMatch));
    }
    await this.loadMatches();
  }

  private async loadMatches(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phaseId = this.selectedPhaseId();
    if (!organizationId || !phaseId) {
      return;
    }
    try {
      this.matches.set(
        await this.scheduleService.listMatches(organizationId, this.tournamentId, phaseId),
      );
    } catch {
      this.errorMessage.set('Impossible de charger le calendrier.');
    }
  }

  protected onFieldToggle(fieldId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedFieldIds.update((ids) =>
      checked ? [...ids, fieldId] : ids.filter((id) => id !== fieldId),
    );
  }

  protected onStartDateTimeChange(event: Event): void {
    this.startDateTime.set((event.target as HTMLInputElement).value);
  }

  protected onMatchDurationChange(event: Event): void {
    this.matchDurationMinutes.set((event.target as HTMLInputElement).value);
  }

  protected onBreakDurationChange(event: Event): void {
    this.breakDurationMinutes.set((event.target as HTMLInputElement).value);
  }

  protected onRefereesPerMatchChange(event: Event): void {
    this.refereesPerMatch.set((event.target as HTMLInputElement).value);
  }

  protected async generateSchedule(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phaseId = this.selectedPhaseId();
    const fieldIds = this.selectedFieldIds();
    const startDateTime = this.startDateTime();
    if (!organizationId || !phaseId || fieldIds.length === 0 || !startDateTime) {
      return;
    }
    this.generating.set(true);
    try {
      this.matches.set(
        await this.scheduleService.generateSchedule(organizationId, this.tournamentId, phaseId, {
          fieldIds,
          startDateTime: new Date(startDateTime).toISOString(),
          matchDurationMinutes: this.matchDurationMinutes()
            ? Number(this.matchDurationMinutes())
            : undefined,
          breakDurationMinutes: this.breakDurationMinutes()
            ? Number(this.breakDurationMinutes())
            : undefined,
          refereesPerMatch: this.refereesPerMatch() ? Number(this.refereesPerMatch()) : undefined,
        }),
      );
    } catch {
      this.errorMessage.set('Impossible de générer le calendrier.');
    } finally {
      this.generating.set(false);
    }
  }

  protected formatSlotTime(startTime: string): string {
    return new Date(startTime).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  protected officialLabel(official: MatchOfficial): string {
    if (official.referee) {
      return `${official.referee.firstName} ${official.referee.lastName}`;
    }
    return official.refereeingTeam?.name ?? '';
  }

  protected async resetSchedule(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phaseId = this.selectedPhaseId();
    if (!organizationId || !phaseId) {
      return;
    }
    try {
      await this.scheduleService.resetSchedule(organizationId, this.tournamentId, phaseId);
      this.matches.set([]);
    } catch {
      this.errorMessage.set('Impossible de vider le calendrier.');
    }
  }
}
