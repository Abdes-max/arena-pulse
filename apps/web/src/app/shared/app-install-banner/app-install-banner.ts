import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Logo } from 'design-system';
import { detectMapsPlatform } from 'shared-models';
import { filter, map } from 'rxjs';
import { AnalyticsService } from '../../core/analytics.service';
import { APP_STORE_URL } from '../../core/app-store';

const DISMISSED_AT_KEY = 'arena-pulse:ios-app-banner-dismissed-at';
const DISMISSED_FOR_MS = 30 * 24 * 60 * 60 * 1000;

// Screens where the app isn't worth mentioning: the organizer/admin areas,
// sign-in and account forms, and the static legal/contact pages.
const HIDDEN_PATH_PREFIXES = [
  '/admin',
  '/super-admin',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/accept-invitation',
  '/verify-email',
  '/player',
  '/contact',
  '/terms',
  '/privacy',
];

/**
 * "Get the app" prompt for visitors on an iPhone/iPad browser: a small
 * bottom banner linking to the App Store. Not shown inside an installed home
 * screen web app, on the areas listed above, or for 30 days after it's been
 * dismissed. iOS only for now -- there's no Google Play listing yet.
 *
 * Deliberately not Safari's own Smart App Banner (the apple-itunes-app meta
 * tag): that one only exists in Safari, not in Chrome/Firefox/Edge on iOS, and
 * can't be translated or restyled.
 */
@Component({
  selector: 'app-install-banner',
  imports: [Logo, TranslocoPipe],
  templateUrl: './app-install-banner.html',
  styleUrl: './app-install-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppInstallBanner {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);

  protected readonly appStoreUrl = APP_STORE_URL;

  private readonly dismissed = signal(this.wasDismissedRecently());
  private readonly iosBrowser = this.isIosBrowser();
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  protected readonly visible = computed(() => {
    if (!this.iosBrowser || this.dismissed()) {
      return false;
    }
    const path = this.path();
    return !HIDDEN_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  });

  protected onInstallClick(): void {
    this.analytics.trackEvent('ios_app_banner_click');
  }

  protected dismiss(): void {
    this.dismissed.set(true);
    this.analytics.trackEvent('ios_app_banner_dismiss');
    try {
      localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    } catch {
      // Storage unavailable: dismissed for this visit only.
    }
  }

  private isIosBrowser(): boolean {
    const window = this.document.defaultView;
    if (!window) {
      return false;
    }
    const { userAgent, maxTouchPoints } = window.navigator;
    if (detectMapsPlatform(userAgent, maxTouchPoints) !== 'ios') {
      return false;
    }
    // Opened from the home screen as a web app: they've already "installed" it.
    const standalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches === true;
    return !standalone;
  }

  private wasDismissedRecently(): boolean {
    try {
      const at = Number(localStorage.getItem(DISMISSED_AT_KEY));
      return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISSED_FOR_MS;
    } catch {
      return false;
    }
  }
}
