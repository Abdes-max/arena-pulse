import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Select, SelectOption } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import { Category, CompetitionPhase, Qualification, Standings } from '../../core/models';
import { StandingsService } from '../../core/standings.service';
import { TournamentsService } from '../../core/tournaments.service';

interface GroupStandings {
  groupId: string;
  groupName: string;
  standings: Standings;
  qualifications: Qualification[];
}

@Component({
  selector: 'app-standings-page',
  imports: [Select],
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly competitionFormatsService = inject(CompetitionFormatsService);
  private readonly standingsService = inject(StandingsService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedPhaseId = signal('');
  protected readonly groupStandings = signal<GroupStandings[]>([]);

  protected readonly groupStagePhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'GROUP_STAGE'),
  );

  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly phaseOptions = computed<SelectOption[]>(() =>
    this.groupStagePhases().map((phase) => ({ value: phase.id, label: phase.name })),
  );

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
      const categories = await this.tournamentsService.listCategories(
        organizationId,
        this.tournamentId,
      );
      this.categories.set(categories);
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

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadPhases();
  }

  private async loadPhases(): Promise<void> {
    const organizationId = this.organization()?.id;
    const categoryId = this.selectedCategoryId();
    if (!organizationId || !categoryId) {
      return;
    }
    this.selectedPhaseId.set('');
    this.groupStandings.set([]);
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
        await this.loadStandings();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les phases.');
    }
  }

  protected async onPhaseChange(phaseId: string): Promise<void> {
    this.selectedPhaseId.set(phaseId);
    await this.loadStandings();
  }

  private async loadStandings(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phase = this.phases().find((p) => p.id === this.selectedPhaseId());
    if (!organizationId || !phase) {
      return;
    }
    try {
      const groupStandings = await Promise.all(
        phase.groups.map(async (group) => ({
          groupId: group.id,
          groupName: group.name,
          standings: await this.standingsService.getStandings(
            organizationId,
            this.tournamentId,
            group.id,
          ),
          qualifications: await this.standingsService.getQualifications(
            organizationId,
            this.tournamentId,
            group.id,
          ),
        })),
      );
      this.groupStandings.set(groupStandings);
    } catch {
      this.errorMessage.set('Impossible de charger les classements.');
    }
  }
}
