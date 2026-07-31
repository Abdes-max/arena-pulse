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
import { Category, CompetitionPhase, Qualification, Standings } from 'shared-models';
import { TournamentContextService } from '../../core/tournament-context.service';

interface GroupStandings {
  groupId: string;
  groupName: string;
  standings: Standings;
  qualifications: Qualification[];
}

@Component({
  selector: 'app-standings-page',
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
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingsPage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);

  protected readonly loading = signal(true);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly groupStandings = signal<GroupStandings[]>([]);

  protected readonly hasGroupStagePhase = computed(() => this.groupStandings().length > 0);

  constructor() {
    void this.loadCategories();
    effect(() => {
      if (this.context.lastMatchEvent()) {
        void this.loadStandings();
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
        await this.loadStandings();
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadStandings();
  }

  private async loadStandings(): Promise<void> {
    const slug = this.context.slug();
    const categoryId = this.selectedCategoryId();
    const phases = await this.api.listPhases(slug, categoryId);
    const groupPhases = phases.filter((p: CompetitionPhase) => p.type === 'GROUP_STAGE');
    const perGroup = await Promise.all(
      groupPhases.flatMap((phase) =>
        phase.groups.map(async (group) => ({
          groupId: group.id,
          groupName: group.name,
          standings: await this.api.getStandings(slug, group.id),
          qualifications: await this.api.getQualifications(slug, group.id),
        })),
      ),
    );
    this.groupStandings.set(perGroup);
  }

  protected isQualified(group: GroupStandings, teamId: string): boolean {
    return group.qualifications.some((qualification) =>
      qualification.qualifiedTeams.some((team) => team.id === teamId),
    );
  }
}
