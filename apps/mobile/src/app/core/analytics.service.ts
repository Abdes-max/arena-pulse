import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../environments/environment';
import { isIosNative } from './native-platform.util';

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

// The organizer's back-office screens -- not audience traffic.
const UNTRACKED_PATH_PREFIXES = ['/organizer'];
const CLIENT_ID_STORAGE_KEY = 'arena-pulse:ga-client-id';

/**
 * Google Analytics 4 (gtag.js) for the iOS app, same measurement ID as the
 * website (apps/web/src/app/core/analytics.service.ts) -- the app's traffic
 * is told apart by its `capacitor://localhost` page hostname and the
 * `app_platform: 'ios'` parameter on every page_view.
 *
 * Differences from the web service, all down to the WKWebView:
 * - gtag's usual `_ga` cookie isn't reliable on the custom capacitor://
 *   scheme (a fresh client per launch would count every launch as a new
 *   user), so no cookie is used (client_storage: 'none') and the app keeps
 *   its own random client_id in localStorage instead.
 * - Only the native iOS build reports anything: Android would first need
 *   its Play "Data safety" form updated (same app bundle, so this stays
 *   gated by platform rather than silently covering both), and the plain
 *   web build of this app is just a dev preview.
 *
 * No-op while environment.gaMeasurementId is empty (dev, tests).
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

  start(): void {
    const measurementId = environment.gaMeasurementId;
    const window = this.document.defaultView;
    if (this.started || !measurementId || !window || !isIosNative()) {
      return;
    }
    this.started = true;

    window.dataLayer = window.dataLayer ?? [];
    // gtag must push the `arguments` object itself, not a copied array --
    // gtag.js ignores plain arrays in dataLayer.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      send_page_view: false,
      client_storage: 'none',
      client_id: this.clientId(window),
    });

    const script = this.document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    this.document.head.appendChild(script);

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.trackPage(event.urlAfterRedirects));
  }

  private trackPage(url: string): void {
    const path = url.split(/[?#]/)[0];
    if (
      UNTRACKED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ) {
      return;
    }
    this.document.defaultView?.gtag?.('event', 'page_view', {
      page_path: path,
      page_title: this.document.title,
      app_platform: 'ios',
    });
  }

  /** Random per-install ID, kept across launches (GA's own notion of "a user"). */
  private clientId(window: Window): string {
    try {
      const stored = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
      if (stored) {
        return stored;
      }
      const created = newClientId(window);
      window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
      return created;
    } catch {
      // Storage unavailable: still reports, just as a new user each launch.
      return newClientId(window);
    }
  }
}

// Same "<random>.<unix seconds>" shape GA's own cookie ID has.
function newClientId(window: Window): string {
  const random = window.crypto.getRandomValues(new Uint32Array(1))[0];
  return `${random}.${Math.floor(Date.now() / 1000)}`;
}
