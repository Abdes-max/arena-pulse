import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../environments/environment';

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

// Organizer/back-office areas -- not audience pages, kept out of the stats.
const UNTRACKED_PATH_PREFIXES = ['/admin', '/super-admin'];

/**
 * Google Analytics 4 (gtag.js), loaded from this bundle rather than the
 * usual inline <script> snippet: the production CSP is script-src 'self'
 * + googletagmanager.com, no 'unsafe-inline' (see infra/deployment/Caddyfile).
 *
 * The SPA never reloads the page, so page views are sent by hand on every
 * router NavigationEnd (send_page_view: false on the config call).
 *
 * start() is the single entry point -- a consent banner can later call it
 * only once the visitor accepts, instead of at bootstrap (app.config.ts).
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
    if (this.started || !measurementId || !window) {
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
    window.gtag('config', measurementId, { send_page_view: false });

    const script = this.document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    this.document.head.appendChild(script);

    // Started from an app initializer, before the first navigation -- its
    // own NavigationEnd covers the landing page, no separate initial hit.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.trackPage(event.urlAfterRedirects));
  }

  /** A custom event (e.g. a banner click) -- a silent no-op until start() has run. */
  trackEvent(name: string, params: Record<string, unknown> = {}): void {
    this.document.defaultView?.gtag?.('event', name, params);
  }

  private trackPage(url: string): void {
    const path = url.split(/[?#]/)[0];
    if (
      UNTRACKED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ) {
      return;
    }
    const window = this.document.defaultView;
    window?.gtag?.('event', 'page_view', {
      page_path: path,
      page_location: `${window.location.origin}${url}`,
      page_title: this.document.title,
    });
  }
}
