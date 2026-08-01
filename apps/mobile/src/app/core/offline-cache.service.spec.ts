import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { OfflineCacheService } from './offline-cache.service';

describe('OfflineCacheService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null for a key that was never set', () => {
    const service = TestBed.inject(OfflineCacheService);
    expect(service.get('missing')).toBeNull();
  });

  it('round-trips data with a cachedAt timestamp', () => {
    const service = TestBed.inject(OfflineCacheService);
    const before = Date.now();

    service.set('tournament:coupe-a1b2', { name: 'Coupe de printemps' });
    const entry = service.get<{ name: string }>('tournament:coupe-a1b2');

    expect(entry?.data).toEqual({ name: 'Coupe de printemps' });
    expect(entry?.cachedAt).toBeGreaterThanOrEqual(before);
  });

  it('overwrites a previous entry for the same key', () => {
    const service = TestBed.inject(OfflineCacheService);

    service.set('team:coupe-a1b2:t1', { name: 'Les Aigles' });
    service.set('team:coupe-a1b2:t1', { name: 'Les Aigles (updated)' });

    expect(service.get<{ name: string }>('team:coupe-a1b2:t1')?.data).toEqual({
      name: 'Les Aigles (updated)',
    });
  });

  it('treats a status-0 HttpErrorResponse as a network failure', () => {
    const service = TestBed.inject(OfflineCacheService);
    expect(service.isNetworkFailure(new HttpErrorResponse({ status: 0 }))).toBe(true);
  });

  it('does not treat a real HTTP error (e.g. 404) as a network failure', () => {
    const service = TestBed.inject(OfflineCacheService);
    expect(service.isNetworkFailure(new HttpErrorResponse({ status: 404 }))).toBe(false);
  });

  it('does not treat a non-HTTP error as a network failure', () => {
    const service = TestBed.inject(OfflineCacheService);
    expect(service.isNetworkFailure(new Error('boom'))).toBe(false);
  });

  it('formats a timestamp as a French HH:MM time', () => {
    const service = TestBed.inject(OfflineCacheService);
    const date = new Date();
    date.setHours(14, 5, 0, 0);

    expect(service.formatTimestamp(date.getTime())).toBe('14:05');
  });
});
