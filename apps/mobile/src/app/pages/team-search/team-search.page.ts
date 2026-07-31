import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PublicApiService } from 'api-client';
import {
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { Category, PublicTeam } from 'shared-models';
import { FavoritesService } from '../../core/favorites.service';
import { TournamentContextService } from '../../core/tournament-context.service';

@Component({
  selector: 'app-team-search-page',
  imports: [
    IonContent,
    IonSelect,
    IonSelectOption,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
  ],
  templateUrl: './team-search.page.html',
  styleUrl: './team-search.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamSearchPage {
  private readonly api = inject(PublicApiService);
  private readonly router = inject(Router);
  private readonly context = inject(TournamentContextService);
  protected readonly favorites = inject(FavoritesService);

  protected readonly loading = signal(true);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly teams = signal<PublicTeam[]>([]);
  protected readonly query = signal('');

  protected readonly filteredTeams = computed(() => {
    const query = this.query().trim().toLowerCase();
    const teams = [...this.teams()].sort((a, b) => a.name.localeCompare(b.name));
    return query ? teams.filter((team) => team.name.toLowerCase().includes(query)) : teams;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    this.loading.set(true);
    try {
      this.categories.set(await this.api.listCategories(slug));
      await this.loadTeams();
    } finally {
      this.loading.set(false);
    }
  }

  private async loadTeams(): Promise<void> {
    const slug = this.context.slug();
    this.teams.set(await this.api.listTeams(slug, this.selectedCategoryId() || undefined));
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadTeams();
  }

  protected onQueryChange(query: string | null | undefined): void {
    this.query.set(query ?? '');
  }

  protected goToTeam(team: PublicTeam): void {
    void this.router.navigate(['/', this.context.slug(), 'team', team.id]);
  }

  protected isFavorite(team: PublicTeam): boolean {
    return this.favorites.isFavorite(this.context.slug(), team.id);
  }

  protected toggleFavorite(event: Event, team: PublicTeam): void {
    event.stopPropagation();
    this.favorites.toggle(this.context.slug(), team.id, team.name);
  }
}
