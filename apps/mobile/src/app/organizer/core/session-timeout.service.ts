import { Injectable, NgZone, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';
import { OrganizerAuthService } from './auth.service';

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const ABSOLUTE_LIMIT_MS = 8 * 60 * 60 * 1000;
const WARNING_LEAD_MS = 60 * 1000;
// Same reasoning as apps/web's own SessionTimeoutService: the access token
// only lives 1h (JWT_EXPIRES_IN, apps/api), so a continuously-active
// organizer needs a periodic silent refresh well under that or a plain 401
// would log them out long before either limit below does.
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;
const CHECK_INTERVAL_MS = 1000;

/**
 * Mobile port of apps/web/src/app/admin/core/session-timeout.service.ts --
 * same 30-min-idle / 8h-absolute policy and 1-minute warning, ported rather
 * than shared (see apps/mobile/src/app/organizer/core/models.ts's own
 * comment on why this whole core/ folder is a deliberate duplicate, not a
 * shared lib). The one real difference: this app has no single shell
 * component every organizer page mounts under (each route is its own
 * standalone Ionic page, see app.routes.ts), so there's nowhere to put a
 * template for the warning -- an Ionic AlertController overlay fills that
 * role instead, presented imperatively from here rather than declared in a
 * template. `providedIn: 'root'` and self-starting: its constructor reacts
 * to OrganizerAuthService.isAuthenticated() directly (see the `effect` below)
 * instead of relying on a shell component's constructor to call start(),
 * since no such single component exists here -- app.config.ts's own
 * provideAppInitializer injects this once, purely to force that constructor
 * to run at startup (same reason it already does that for
 * OrganizerAuthService.silentRefresh()).
 */
@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private readonly authService = inject(OrganizerAuthService);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly transloco = inject(TranslocoService);
  private readonly ngZone = inject(NgZone);

  private lastActivityAt = Date.now();
  private sessionStartedAt = Date.now();
  private lastRefreshAt = Date.now();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private activityListenerAbort: AbortController | null = null;
  private warningAlert: HTMLIonAlertElement | null = null;
  private warningVisible = false;

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
    this.sessionStartedAt = Date.now();
    this.lastActivityAt = Date.now();
    this.lastRefreshAt = Date.now();

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

  private stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.activityListenerAbort?.abort();
    this.activityListenerAbort = null;
    void this.dismissWarning();
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const idleRemaining = IDLE_LIMIT_MS - (now - this.lastActivityAt);
    const absoluteRemaining = ABSOLUTE_LIMIT_MS - (now - this.sessionStartedAt);
    const remaining = Math.min(idleRemaining, absoluteRemaining);

    if (remaining <= 0) {
      await this.expireSession();
      return;
    }

    if (remaining <= WARNING_LEAD_MS) {
      await this.showOrUpdateWarning(Math.ceil(remaining / 1000));
      return;
    }

    // Only while comfortably active -- same reasoning as the web version:
    // once the warning is showing, extending is the organizer's explicit
    // choice (extendSession() below), not something to do silently behind it.
    if (now - this.lastRefreshAt >= TOKEN_REFRESH_INTERVAL_MS) {
      this.lastRefreshAt = now;
      void this.authService.silentRefresh();
    }
  }

  private async showOrUpdateWarning(secondsRemaining: number): Promise<void> {
    const lang = this.transloco.getActiveLang();
    const message = this.transloco.translate(
      'organizer.auth.sessionTimeout.body',
      { seconds: secondsRemaining },
      lang,
    );
    if (this.warningAlert) {
      this.warningAlert.message = message;
      return;
    }
    if (this.warningVisible) {
      // A dismiss/create cycle is already in flight -- avoid presenting a
      // second overlay on top of itself from a tick that lands mid-flight.
      return;
    }
    this.warningVisible = true;
    const alert = await this.alertController.create({
      header: this.transloco.translate('organizer.auth.sessionTimeout.title', {}, lang),
      message,
      backdropDismiss: false,
      buttons: [
        {
          text: this.transloco.translate('organizer.auth.sessionTimeout.logout', {}, lang),
          role: 'destructive',
          handler: () => {
            void this.logoutNow();
          },
        },
        {
          text: this.transloco.translate('organizer.auth.sessionTimeout.stayConnected', {}, lang),
          handler: () => {
            void this.extendSession();
          },
        },
      ],
    });
    this.warningAlert = alert;
    await alert.present();
  }

  private async dismissWarning(): Promise<void> {
    const alert = this.warningAlert;
    this.warningAlert = null;
    this.warningVisible = false;
    if (alert) {
      await alert.dismiss();
    }
  }

  private async extendSession(): Promise<void> {
    await this.dismissWarning();
    this.lastActivityAt = Date.now();
    this.sessionStartedAt = Date.now();
    this.lastRefreshAt = Date.now();
    await this.authService.silentRefresh();
  }

  private async logoutNow(): Promise<void> {
    await this.dismissWarning();
    await this.expireSession();
  }

  private async expireSession(): Promise<void> {
    this.stop();
    await this.authService.logout();
    await this.router.navigateByUrl('/organizer/login?sessionExpired=1');
  }
}
