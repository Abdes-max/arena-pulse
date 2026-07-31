import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';
import { FavoritesService } from '../../core/favorites.service';
import { TournamentContextService } from '../../core/tournament-context.service';

@Component({
  selector: 'app-favorites-page',
  imports: [IonContent, IonList, IonItem, IonLabel, IonButton],
  templateUrl: './favorites.page.html',
  styleUrl: './favorites.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoritesPage {
  private readonly favorites = inject(FavoritesService);
  private readonly context = inject(TournamentContextService);
  private readonly router = inject(Router);

  protected readonly teams = computed(() => this.favorites.favoritesFor(this.context.slug()));

  protected goToTeam(teamId: string): void {
    void this.router.navigate(['/', this.context.slug(), 'team', teamId]);
  }

  protected removeFavorite(teamId: string, teamName: string): void {
    this.favorites.toggle(this.context.slug(), teamId, teamName);
  }
}
