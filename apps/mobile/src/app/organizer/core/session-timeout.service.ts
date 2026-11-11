import { Injectable, NgZone, effect, inject } from '@angular/core';
import { OrganizerAuthService } from './auth.service';

// The access token only lives 1h (JWT_EXPIRES_IN, apps/api), so a signed-in
// organizer needs a refresh well under that or API calls start returning 401.
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;
// Coming back to the app after a while: refresh right away rather than waiting
// for the next tick, since the access token has often expired in the background.
const RESUME_REFRESH_AFTER_MS = 10 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Keeps the organizer signed in on this device. Unlike apps/web's
 * SessionTimeoutService (30-min idle / 8h absolute auto-logout, right for a
 * shared browser), a phone app stays signed in as the last account until the
 * organizer logs out themselves: the idle/absolute limits made the app ask for
 * the credentials again every few hours. `providedIn: 'root'` and
 * self-starting: it reacts to OrganizerAuthService.isAuthenticated() directly,
 * and app.config.ts's provideAppInitializer injects it once at startup to force
 * that constructor to run.
 */
@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private readonly authService = inject(OrganizerAuthService);
  private readonly ngZone = inject(NgZone);

  private lastRefreshAt = Date.now();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private visibilityAbort: AbortController | null = null;

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.start();
      } else {
        this.stop();
      }
    });
  }

  private start(): void {
    if (this.intervalId !== null) {
      return;
    }
    this.lastRefreshAt = Date.now();
    this.ngZone.runOutsideAngular(() => {
      const controller = new AbortController();
      this.visibilityAbort = controller;
      document.addEventListener(
        'visibilitychange',
        () => {
          if (
            document.visibilityState === 'visible' &&
            Date.now() - this.lastRefreshAt >= RESUME_REFRESH_AFTER_MS
          ) {
            this.ngZone.run(() => this.refresh());
          }
        },
        { passive: true, signal: controller.signal },
      );
      this.intervalId = setInterval(() => {
        if (Date.now() - this.lastRefreshAt >= TOKEN_REFRESH_INTERVAL_MS) {
          this.ngZone.run(() => this.refresh());
        }
      }, CHECK_INTERVAL_MS);
    });
  }

  private stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.visibilityAbort?.abort();
    this.visibilityAbort = null;
  }

  private refresh(): void {
    this.lastRefreshAt = Date.now();
    void this.authService.silentRefresh();
  }
}
