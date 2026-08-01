import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FavoritesService } from './favorites.service';
import { NotificationsService } from './notifications.service';

const STORAGE_KEY = 'arena-pulse:favorite-teams';

describe('FavoritesService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: NotificationsService, useValue: { requestPermission: vi.fn() } }],
    });
  });

  it('starts empty when nothing is stored', () => {
    const service = TestBed.inject(FavoritesService);
    expect(service.favorites()).toEqual([]);
  });

  it('loads previously persisted favorites on construction', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ tournamentSlug: 'coupe-a1b2', teamId: 't1', teamName: 'Les Aigles' }]),
    );

    const service = TestBed.inject(FavoritesService);

    expect(service.isFavorite('coupe-a1b2', 't1')).toBe(true);
  });

  it('adds a team on first toggle and persists it', () => {
    const service = TestBed.inject(FavoritesService);

    service.toggle('coupe-a1b2', 't1', 'Les Aigles');

    expect(service.isFavorite('coupe-a1b2', 't1')).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([
      { tournamentSlug: 'coupe-a1b2', teamId: 't1', teamName: 'Les Aigles' },
    ]);
  });

  it('removes a team on second toggle', () => {
    const service = TestBed.inject(FavoritesService);

    service.toggle('coupe-a1b2', 't1', 'Les Aigles');
    service.toggle('coupe-a1b2', 't1', 'Les Aigles');

    expect(service.isFavorite('coupe-a1b2', 't1')).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([]);
  });

  it('scopes favorites per tournament', () => {
    const service = TestBed.inject(FavoritesService);

    service.toggle('coupe-a1b2', 't1', 'Les Aigles');
    service.toggle('coupe-c3d4', 't1', 'Les Aigles (autre tournoi)');

    expect(service.favoritesFor('coupe-a1b2')).toEqual([
      { tournamentSlug: 'coupe-a1b2', teamId: 't1', teamName: 'Les Aigles' },
    ]);
    expect(service.favoritesFor('coupe-c3d4')).toEqual([
      { tournamentSlug: 'coupe-c3d4', teamId: 't1', teamName: 'Les Aigles (autre tournoi)' },
    ]);
  });
});
