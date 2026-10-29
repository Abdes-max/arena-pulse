import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';

const STORAGE_KEY = 'arena-pulse:favorite-teams';

describe('FavoritesService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('loads previously persisted favorites on construction', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ tournamentSlug: 'coupe-a1b2', teamId: 't1', teamName: 'Les Aigles' }]),
    );

    const service = TestBed.inject(FavoritesService);

    expect(service.isFavorite('coupe-a1b2', 't1')).toBe(true);
  });

  it('adds then removes a team on toggle and persists each change', () => {
    const service = TestBed.inject(FavoritesService);

    service.toggle('coupe-a1b2', 't1', 'Les Aigles');
    expect(service.isFavorite('coupe-a1b2', 't1')).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([
      { tournamentSlug: 'coupe-a1b2', teamId: 't1', teamName: 'Les Aigles' },
    ]);

    service.toggle('coupe-a1b2', 't1', 'Les Aigles');
    expect(service.isFavorite('coupe-a1b2', 't1')).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([]);
  });

  it('keeps favorites scoped per tournament', () => {
    const service = TestBed.inject(FavoritesService);

    service.toggle('coupe-a1b2', 't1', 'Les Aigles');
    service.toggle('autre-c3d4', 't2', 'Les Lions');

    expect(service.favoritesFor('coupe-a1b2').map((f) => f.teamId)).toEqual(['t1']);
    expect(service.isFavorite('autre-c3d4', 't1')).toBe(false);
  });

  it('starts empty when the stored value is corrupted', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    expect(TestBed.inject(FavoritesService).favorites()).toEqual([]);
  });
});
