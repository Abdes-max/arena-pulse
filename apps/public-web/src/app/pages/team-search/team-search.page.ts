import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { TournamentContextService } from '../../core/tournament-context.service';
import { Category, PublicTeam } from '../../core/models';

@Component({
  selector: 'app-team-search-page',
  imports: [RouterLink],
  templateUrl: './team-search.page.html',
  styleUrl: './team-search.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamSearchPage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);

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

  protected async onCategoryChange(event: Event): Promise<void> {
    this.selectedCategoryId.set((event.target as HTMLSelectElement).value);
    await this.loadTeams();
  }

  protected onQueryChange(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
