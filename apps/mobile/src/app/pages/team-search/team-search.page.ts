import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AssetUrlService, PublicApiService } from 'api-client';
import {
  IonButton,
  IonContent,
  IonLabel,
  IonSegment,
  IonSegmentButton,
} from '@ionic/angular/standalone';
import { TextField } from 'design-system';
import { Category, PublicTeam } from 'shared-models';
import { FavoritesService } from '../../core/favorites.service';
import { TournamentContextService } from '../../core/tournament-context.service';

@Component({
  selector: 'app-team-search-page',
  imports: [IonContent, IonSegment, IonSegmentButton, IonLabel, IonButton, TextField],
  templateUrl: './team-search.page.html',
  styleUrl: './team-search.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamSearchPage {
  private readonly api = inject(PublicApiService);
  private readonly router = inject(Router);
  private readonly context = inject(TournamentContextService);
  protected readonly favorites = inject(FavoritesService);
  protected readonly assetUrl = inject(AssetUrlService);

  protected readonly loading = signal(true);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly teams = signal<PublicTeam[]>([]);
  protected readonly query = signal('');

  // Favorites first (alphabetical among themselves), then the rest
  // (alphabetical) -- isFavorite() reads the favorites signal, so this
  // recomputes whenever a favorite is toggled.
  protected readonly filteredTeams = computed(() => {
    const query = this.query().trim().toLowerCase();
    const teams = [...this.teams()].sort((a, b) => {
      const aFavorite = this.isFavorite(a);
      const bFavorite = this.isFavorite(b);
      if (aFavorite !== bFavorite) {
        return aFavorite ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    return query ? teams.filter((team) => team.name.toLowerCase().includes(query)) : teams;
  });

  constructor() {
    void this.load();
  }

  /**
   * Every time the Équipes tab opens (Ionic keeps this page alive between
   * visits, so not in the constructor): a visitor following a favorite
   * team lands straight on its page. The page's "Toutes les équipes" link
   * comes back here with ?list=1 to stay on the list.
   */
  ionViewWillEnter(): void {
    const favorite = this.favorites.favoritesFor(this.context.slug())[0];
    if (favorite && !this.router.url.includes('list=1')) {
      void this.router.navigate(['/', this.context.slug(), 'team', favorite.teamId], {
        replaceUrl: true,
      });
    }
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

  // ion-segment's ionChange event types its value as SegmentValue (string |
  // number) | undefined, even though every value bound here is a string id.
  protected asString(value: string | number | undefined): string {
    return String(value ?? '');
  }

  protected onQueryChange(query: string): void {
    this.query.set(query);
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
