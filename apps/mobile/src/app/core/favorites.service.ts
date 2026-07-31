import { Injectable, signal } from '@angular/core';

export interface FavoriteTeam {
  tournamentSlug: string;
  teamId: string;
  teamName: string;
}

const STORAGE_KEY = 'arena-pulse:favorite-teams';

/**
 * Local-only (no mobile auth yet, see docs/architecture/mobile-foundation.md)
 * favorites, persisted in localStorage so they survive app restarts.
 * Provided in root: unlike TournamentContextService, favorites must be
 * readable across tournaments (e.g. a future cross-tournament view).
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly favoritesState = signal<FavoriteTeam[]>(this.readFromStorage());

  readonly favorites = this.favoritesState.asReadonly();

  isFavorite(tournamentSlug: string, teamId: string): boolean {
    return this.favoritesState().some(
      (favorite) => favorite.tournamentSlug === tournamentSlug && favorite.teamId === teamId,
    );
  }

  favoritesFor(tournamentSlug: string): FavoriteTeam[] {
    return this.favoritesState().filter((favorite) => favorite.tournamentSlug === tournamentSlug);
  }

  toggle(tournamentSlug: string, teamId: string, teamName: string): void {
    const current = this.favoritesState();
    const exists = current.some(
      (favorite) => favorite.tournamentSlug === tournamentSlug && favorite.teamId === teamId,
    );
    const next = exists
      ? current.filter(
          (favorite) => !(favorite.tournamentSlug === tournamentSlug && favorite.teamId === teamId),
        )
      : [...current, { tournamentSlug, teamId, teamName }];
    this.favoritesState.set(next);
    this.writeToStorage(next);
  }

  private readFromStorage(): FavoriteTeam[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as FavoriteTeam[]) : [];
    } catch {
      return [];
    }
  }

  private writeToStorage(favorites: FavoriteTeam[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // Storage unavailable (private browsing, quota) -- favorites just won't persist across reloads.
    }
  }
}
