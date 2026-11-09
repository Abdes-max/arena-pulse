import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { environment } from '../../environments/environment';
import { AnalyticsService } from './analytics.service';

const { platformMock } = vi.hoisted(() => ({
  platformMock: vi.fn(() => 'ios'),
}));

// A package import (not a relative one) -- the only kind the Angular unit-test
// runner lets vi.mock replace. isIosNative() reads Capacitor.getPlatform().
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: platformMock } }));

describe('AnalyticsService (iOS app)', () => {
  const originalMeasurementId = environment.gaMeasurementId;
  const events = new Subject<unknown>();
  let service: AnalyticsService;

  function resetPage(): void {
    delete window.gtag;
    delete window.dataLayer;
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    window.localStorage.clear();
  }

  beforeEach(() => {
    resetPage();
    environment.gaMeasurementId = 'G-TEST123';
    platformMock.mockReturnValue('ios');
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { events } }],
    });
    service = TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    resetPage();
    environment.gaMeasurementId = originalMeasurementId;
  });

  function pageViews(): Record<string, unknown>[] {
    return (window.dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((args) => args[0] === 'event' && args[1] === 'page_view')
      .map((args) => args[2] as Record<string, unknown>);
  }

  it('does nothing without a measurement ID', () => {
    environment.gaMeasurementId = '';

    service.start();

    expect(window.gtag).toBeUndefined();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it('does nothing outside the native iOS build', () => {
    platformMock.mockReturnValue('android');

    service.start();

    expect(window.gtag).toBeUndefined();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it('loads gtag with no cookie and a persistent client ID', () => {
    service.start();

    expect(document.head.querySelector('script[src*="id=G-TEST123"]')).not.toBeNull();
    const config = Array.from(window.dataLayer![1] as ArrayLike<unknown>);
    expect(config[0]).toBe('config');
    expect(config[1]).toBe('G-TEST123');
    expect(config[2]).toMatchObject({ send_page_view: false, client_storage: 'none' });
    const clientId = (config[2] as { client_id: string }).client_id;
    expect(clientId).toMatch(/^\d+\.\d+$/);
    expect(window.localStorage.getItem('arena-pulse:ga-client-id')).toBe(clientId);
  });

  it('reuses the stored client ID on the next launch', () => {
    window.localStorage.setItem('arena-pulse:ga-client-id', '42.1700000000');

    service.start();

    const config = Array.from(window.dataLayer![1] as ArrayLike<unknown>);
    expect((config[2] as { client_id: string }).client_id).toBe('42.1700000000');
  });

  it('sends a page_view per navigation, tagged as the iOS app, and skips the organizer area', () => {
    service.start();

    events.next(new NavigationEnd(1, '/tournoi-x', '/tournoi-x?tab=1'));
    events.next(new NavigationEnd(2, '/organizer/tournaments', '/organizer/tournaments'));

    expect(pageViews()).toEqual([
      expect.objectContaining({ page_path: '/tournoi-x', app_platform: 'ios' }),
    ]);
  });

  it('only starts once', () => {
    service.start();
    service.start();

    expect(document.head.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1);
  });
});
