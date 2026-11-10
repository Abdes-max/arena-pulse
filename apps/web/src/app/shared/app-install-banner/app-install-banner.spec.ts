import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import { AnalyticsService } from '../../core/analytics.service';
import { APP_STORE_URL } from '../../core/app-store';
import { AppInstallBanner } from './app-install-banner';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const DISMISSED_AT_KEY = 'arena-pulse:ios-app-banner-dismissed-at';
const DAY = 24 * 60 * 60 * 1000;

@Component({ template: '' })
class BlankPage {}

describe('AppInstallBanner', () => {
  let trackEvent: ReturnType<typeof vi.fn>;

  function create(userAgent: string) {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [
        AppInstallBanner,
        TranslocoTestingModule.forRoot({
          langs: {
            fr: {
              appBanner: {
                title: "Installez l'app TournArena",
                subtitle: 'Suivez vos tournois en direct.',
                cta: 'Installer',
                dismissAria: 'Fermer',
              },
            },
          },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideRouter([{ path: '**', component: BlankPage }]),
        { provide: AnalyticsService, useValue: { trackEvent } },
      ],
    });
    const fixture = TestBed.createComponent(AppInstallBanner);
    fixture.detectChanges();
    return fixture;
  }

  const banner = (root: HTMLElement) => root.querySelector('.app-install-banner');

  beforeEach(() => {
    localStorage.clear();
    trackEvent = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window.navigator as { standalone?: boolean }).standalone;
  });

  it('shows on an iPhone, with a link to the App Store', () => {
    const fixture = create(IPHONE_UA);

    const element = fixture.nativeElement as HTMLElement;
    expect(banner(element)).not.toBeNull();
    expect(element.querySelector<HTMLAnchorElement>('.app-install-banner__cta')?.href).toBe(
      APP_STORE_URL,
    );
    expect(element.textContent).toContain("Installez l'app TournArena");
  });

  it('also shows in Chrome on iOS, which has no Safari smart banner', () => {
    expect(banner(create(IPHONE_CHROME_UA).nativeElement)).not.toBeNull();
  });

  it('stays hidden on Android and on a computer', () => {
    expect(banner(create(ANDROID_UA).nativeElement)).toBeNull();
    expect(banner(create(DESKTOP_UA).nativeElement)).toBeNull();
  });

  it('stays hidden in a home-screen web app', () => {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });

    expect(banner(create(IPHONE_UA).nativeElement)).toBeNull();
  });

  it('can be dismissed, and stays dismissed on the next visit', () => {
    const fixture = create(IPHONE_UA);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.app-install-banner__close')!
      .click();
    fixture.detectChanges();

    expect(banner(fixture.nativeElement)).toBeNull();
    expect(trackEvent).toHaveBeenCalledWith('ios_app_banner_dismiss');
    expect(Number(localStorage.getItem(DISMISSED_AT_KEY))).toBeGreaterThan(0);
    expect(banner(create(IPHONE_UA).nativeElement)).toBeNull();
  });

  it('comes back 30 days after a dismissal', () => {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now() - 29 * DAY));
    expect(banner(create(IPHONE_UA).nativeElement)).toBeNull();

    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now() - 31 * DAY));
    expect(banner(create(IPHONE_UA).nativeElement)).not.toBeNull();
  });

  it('is hidden in the admin and on account pages, shown on public pages', async () => {
    const fixture = create(IPHONE_UA);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/admin/tournaments');
    fixture.detectChanges();
    expect(banner(fixture.nativeElement)).toBeNull();

    await router.navigateByUrl('/login');
    fixture.detectChanges();
    expect(banner(fixture.nativeElement)).toBeNull();

    await router.navigateByUrl('/coupe-des-nations');
    fixture.detectChanges();
    expect(banner(fixture.nativeElement)).not.toBeNull();
  });

  it('reports a click on the install button', () => {
    const fixture = create(IPHONE_UA);
    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.app-install-banner__cta',
    )!;
    // Don't actually follow the link in the test browser.
    cta.addEventListener('click', (event) => event.preventDefault());

    cta.click();

    expect(trackEvent).toHaveBeenCalledWith('ios_app_banner_click');
  });
});
