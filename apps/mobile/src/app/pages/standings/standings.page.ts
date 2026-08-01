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
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { Category, CompetitionPhase, Qualification, Standings } from 'shared-models';
import { OfflineCacheService } from '../../core/offline-cache.service';
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
    IonButton,
  ],
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingsPage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  protected readonly cache = inject(OfflineCacheService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly groupStandings = signal<GroupStandings[]>([]);
  protected readonly cachedAt = signal<number | null>(null);

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
    const cacheKey = `standings-categories:${slug}`;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const categories = await this.api.listCategories(slug);
      this.categories.set(categories);
      this.cache.set(cacheKey, categories);
      this.cachedAt.set(null);
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadStandings();
      }
    } catch (error) {
      const cached = this.cache.get<Category[]>(cacheKey);
      if (this.cache.isNetworkFailure(error) && cached) {
        this.categories.set(cached.data);
        this.cachedAt.set(cached.cachedAt);
        if (cached.data.length > 0) {
          this.selectedCategoryId.set(cached.data[0].id);
          await this.loadStandings();
        }
      } else {
        this.errorMessage.set('Impossible de charger les classements.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadStandings();
  }

  protected retry(): void {
    void this.loadCategories();
  }

  private async loadStandings(): Promise<void> {
    const slug = this.context.slug();
    const categoryId = this.selectedCategoryId();
    const cacheKey = `standings:${slug}:${categoryId}`;
    try {
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
      this.cache.set(cacheKey, perGroup);
      this.cachedAt.set(null);
    } catch (error) {
      const cached = this.cache.get<GroupStandings[]>(cacheKey);
      if (this.cache.isNetworkFailure(error) && cached) {
        this.groupStandings.set(cached.data);
        this.cachedAt.set(cached.cachedAt);
      } else if (!cached) {
        this.errorMessage.set('Impossible de charger les classements pour cette catégorie.');
      }
    }
  }

  protected isQualified(group: GroupStandings, teamId: string): boolean {
    return group.qualifications.some((qualification) =>
      qualification.qualifiedTeams.some((team) => team.id === teamId),
    );
  }
}
