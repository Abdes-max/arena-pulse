import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const ABSOLUTE_LIMIT_MS = 8 * 60 * 60 * 1000;
const WARNING_LEAD_MS = 60 * 1000;
// The access token itself only lives 1h (JWT_EXPIRES_IN, apps/api) --
// without this, a continuously-active organizer would still get logged out
// by a plain 401 an hour in, long before either limit above. Refreshed well
// under that 1h so a slow tick (CHECK_INTERVAL_MS below) never lets it lapse.
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;
const CHECK_INTERVAL_MS = 1000;

/**
 * Enforces the organizer admin's session policy end to end: logs out after
 * 30 minutes with no activity, or after 8 hours regardless of activity,
 * surfacing a 1-minute countdown warning (AppShell's own template renders
 * it) before either takes effect. `providedIn: 'root'` (a single instance
 * for the app's whole lifetime), but its interval only runs between
 * AppShell's own start()/stop() calls -- AppShell calls start() in its
 * constructor and stop() via its own DestroyRef.onDestroy, so the clock
 * only ticks while an /admin page is actually mounted.
 *
 * Deliberately timer-driven rather than per-event-driven: activity only
 * ever *resets* `lastActivityAt`, a single setInterval tick (CHECK_INTERVAL_MS)
 * is what actually evaluates both limits and flips the warning/logout state,
 * so the two limits compose for free instead of needing their own timers.
 */
@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);

  private lastActivityAt = Date.now();
  private sessionStartedAt = Date.now();
  private lastRefreshAt = Date.now();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private activityListenerAbort: AbortController | null = null;

  private readonly remainingMs = signal(Math.min(IDLE_LIMIT_MS, ABSOLUTE_LIMIT_MS));
  readonly warningVisible = computed(() => this.remainingMs() <= WARNING_LEAD_MS);
  readonly secondsRemaining = computed(() => Math.max(0, Math.ceil(this.remainingMs() / 1000)));

  /** Call once the organizer is authenticated (AppShell's constructor) -- a no-op if already running. */
  start(): void {
    if (this.intervalId !== null) {
      return;
    }
    this.sessionStartedAt = Date.now();
    this.lastActivityAt = Date.now();
    this.lastRefreshAt = Date.now();
    this.remainingMs.set(Math.min(IDLE_LIMIT_MS, ABSOLUTE_LIMIT_MS));

    // Passive, outside Angular's zone -- these fire on every click/keypress
    // across the whole admin area, and all they do is stamp a timestamp, so
    // there is nothing here that needs (or should trigger) change detection.
    this.ngZone.runOutsideAngular(() => {
      const controller = new AbortController();
      this.activityListenerAbort = controller;
      const onActivity = () => {
        this.lastActivityAt = Date.now();
      };
      const options = { passive: true, signal: controller.signal } as const;
      document.addEventListener('mousedown', onActivity, options);
      document.addEventListener('keydown', onActivity, options);
      document.addEventListener('touchstart', onActivity, options);
      document.addEventListener('scroll', onActivity, options);

      this.intervalId = setInterval(() => this.ngZone.run(() => this.tick()), CHECK_INTERVAL_MS);
    });
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.activityListenerAbort?.abort();
    this.activityListenerAbort = null;
  }

  /** "Rester connecté" -- resets both limits and renews the access token right away rather than waiting for the next periodic refresh. */
  async extendSession(): Promise<void> {
    this.lastActivityAt = Date.now();
    this.sessionStartedAt = Date.now();
    this.lastRefreshAt = Date.now();
    this.remainingMs.set(Math.min(IDLE_LIMIT_MS, ABSOLUTE_LIMIT_MS));
    await this.authService.silentRefresh();
  }

  private tick(): void {
    const now = Date.now();
    const idleRemaining = IDLE_LIMIT_MS - (now - this.lastActivityAt);
    const absoluteRemaining = ABSOLUTE_LIMIT_MS - (now - this.sessionStartedAt);
    const remaining = Math.min(idleRemaining, absoluteRemaining);
    this.remainingMs.set(remaining);

    if (remaining <= 0) {
      void this.expireSession();
      return;
    }

    // Only while comfortably active (well outside the warning window) --
    // once the warning is showing, extending is an explicit, visible choice
    // (extendSession() above), not something to do silently behind it.
    const idleComfortably = now - this.lastActivityAt < IDLE_LIMIT_MS - WARNING_LEAD_MS;
    if (idleComfortably && now - this.lastRefreshAt >= TOKEN_REFRESH_INTERVAL_MS) {
      this.lastRefreshAt = now;
      void this.authService.silentRefresh();
    }
  }

  private async expireSession(): Promise<void> {
    this.stop();
    await this.authService.logout();
    await this.router.navigateByUrl('/login?sessionExpired=1');
  }
}
