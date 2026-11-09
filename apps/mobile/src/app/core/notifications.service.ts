import { Injectable, Injector, Signal, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PublicApiService } from 'api-client';
import { LanguageService } from 'design-tokens';
import type { Match, MatchStatus } from 'shared-models';
import type { FavoriteTeam } from './favorites.service';
import { NotificationKind, channelNames, notificationBody } from './notification-messages';
import { NotificationPrefs, NotificationSettingsService } from './notification-settings.service';

interface TrackedMatchState {
  status: MatchStatus;
  scoreKey: string | null;
}

interface ReminderExtra {
  kind: 'reminder';
  slug: string;
  teamId: string;
  teamKey: string;
  matchId: string;
}

interface ReminderCandidate {
  favorite: FavoriteTeam;
  match: Match;
  prefs: NotificationPrefs;
  at: Date;
}

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt';

const TITLE = 'TournArena';
const CHANNEL_ALERTS = 'tournarena-alerts';
const CHANNEL_SILENT = 'tournarena-silent';
// iOS keeps at most 64 pending local notifications -- stay under it.
const MAX_PENDING_REMINDERS = 60;
const SYNC_DEBOUNCE_MS = 500;
const TEST_NOTIFICATION_ID = 2_000_000_000;
// Seconds between tapping "test" and the notification: enough time to lock the phone.
const TEST_DELAY_MS = 8000;

/**
 * Local notifications for favorite teams (docs/product/user-stories.md),
 * configurable through NotificationSettingsService. There's no backend/push
 * infrastructure for this app -- no mobile auth means no reliable
 * device-token-to-user mapping -- so everything is scheduled natively with
 * @capacitor/local-notifications:
 *
 * - Reminders ("starts in N min") are scheduled ahead for a date, so they
 *   fire with the app closed and the phone locked.
 * - "Match started", score changes and final results are detected by polling
 *   data the app already has, so they only fire while the app is running
 *   (foreground or backgrounded), never when fully closed like a real
 *   server push would.
 *
 * On iOS the banner shows both on the lock screen and while the app is open
 * (presentationOptions in capacitor.config.ts); the user's own iOS settings
 * for the app decide where else it appears.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(PublicApiService);
  private readonly settings = inject(NotificationSettingsService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly lastSeen = new Map<string, TrackedMatchState>();
  private nextNotificationId = 1;
  private initialized = false;
  // Reminder syncs run one at a time -- two overlapping ones would each
  // cancel and re-create the same notifications.
  private syncQueue: Promise<void> = Promise.resolve();

  /**
   * Called once at startup (app.config.ts) with the favorites signal:
   * registers the Android channels and the tap handler, and keeps the
   * scheduled reminders in step with favorites, settings and language.
   */
  init(favorites: Signal<FavoriteTeam[]>): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    void this.createAndroidChannels();
    try {
      void LocalNotifications.addListener('localNotificationActionPerformed', (event) =>
        this.openFromNotification(event.notification.extra),
      ).catch(() => undefined);
    } catch {
      // Plugin unavailable (plain browser): nothing to tap.
    }

    effect(
      (onCleanup) => {
        this.settings.settings();
        this.languageService.language();
        const current = favorites();
        const timer = setTimeout(() => this.queueReminderSync(current), SYNC_DEBOUNCE_MS);
        onCleanup(() => clearTimeout(timer));
      },
      { injector: this.injector },
    );
  }

  async requestPermission(): Promise<void> {
    try {
      await LocalNotifications.requestPermissions();
    } catch {
      // Best-effort: denied/unsupported (e.g. an unsupported desktop browser
      // during dev) just means later schedule() calls silently no-op too.
    }
  }

  async permissionState(): Promise<NotificationPermissionState> {
    try {
      const { display } = await LocalNotifications.checkPermissions();
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'denied';
    }
  }

  /**
   * Schedules a notification a few seconds out, with the global sound
   * setting, so the user can lock the phone (or stay in the app) and see
   * exactly how it shows up. False when notifications aren't allowed.
   */
  async sendTest(): Promise<boolean> {
    await this.requestPermission();
    if ((await this.permissionState()) !== 'granted') {
      return false;
    }
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: TEST_NOTIFICATION_ID,
            title: TITLE,
            body: notificationBody(this.languageService.language(), 'test'),
            schedule: { at: new Date(Date.now() + TEST_DELAY_MS), allowWhileIdle: true },
            ...this.delivery(this.settings.global()),
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }

  async checkFavoriteUpdates(tournamentSlug: string, favorites: FavoriteTeam[]): Promise<void> {
    await Promise.all(favorites.map((favorite) => this.checkTeam(tournamentSlug, favorite)));
  }

  private async checkTeam(tournamentSlug: string, favorite: FavoriteTeam): Promise<void> {
    let matches: Match[];
    try {
      matches = (await this.api.getTeam(tournamentSlug, favorite.teamId)).matches;
    } catch {
      return;
    }

    const prefs = this.settings.prefsFor(tournamentSlug, favorite.teamId);
    const extra = { slug: tournamentSlug, teamId: favorite.teamId };
    for (const match of matches) {
      const current: TrackedMatchState = {
        status: match.status,
        scoreKey: match.score ? `${match.score.homeScore}-${match.score.awayScore}` : null,
      };
      const previous = this.lastSeen.get(match.id);
      // Always tracked, even with notifications off, so turning them on later
      // doesn't fire for something that already happened.
      this.lastSeen.set(match.id, current);
      if (!previous || !prefs.enabled) {
        continue; // First sighting of this match -- establishes the baseline, doesn't notify.
      }
      if (previous.status !== 'LIVE' && current.status === 'LIVE') {
        if (prefs.started) {
          void this.notify('started', match, favorite, prefs, extra);
        }
      } else if (previous.status !== 'COMPLETED' && current.status === 'COMPLETED') {
        if (prefs.result) {
          void this.notify('result', match, favorite, prefs, extra);
        }
      } else if (current.scoreKey && current.scoreKey !== previous.scoreKey) {
        if (prefs.score) {
          void this.notify('score', match, favorite, prefs, extra);
        }
      }
    }
  }

  private async notify(
    kind: NotificationKind,
    match: Match,
    favorite: FavoriteTeam,
    prefs: NotificationPrefs,
    extra: Record<string, string>,
  ): Promise<void> {
    const body = notificationBody(this.languageService.language(), kind, {
      team: favorite.teamName,
      home: match.homeTeam?.name,
      away: match.awayTeam?.name,
      homeScore: match.score?.homeScore,
      awayScore: match.score?.awayScore,
    });
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: this.nextNotificationId++,
            title: TITLE,
            body,
            extra,
            ...this.delivery(prefs),
          },
        ],
      });
    } catch {
      // Permission not granted, or unsupported platform -- no-op.
    }
  }

  private queueReminderSync(favorites: FavoriteTeam[]): void {
    this.syncQueue = this.syncQueue.then(() => this.syncReminders(favorites));
  }

  /**
   * Re-creates the "starts in N min" reminders of every favorite team from
   * the current schedule. Reminders of a team whose schedule couldn't be
   * fetched (offline) are left as they were rather than wiped.
   */
  async syncReminders(favorites: FavoriteTeam[]): Promise<void> {
    try {
      const language = this.languageService.language();
      const favoriteKeys = new Set(favorites.map((f) => this.keyOf(f)));
      const resolved = new Set<string>();
      const candidates: ReminderCandidate[] = [];

      await Promise.all(
        favorites.map(async (favorite) => {
          const key = this.keyOf(favorite);
          const prefs = this.settings.prefsFor(favorite.tournamentSlug, favorite.teamId);
          if (!prefs.enabled || !prefs.reminder) {
            resolved.add(key);
            return;
          }
          let matches: Match[];
          try {
            matches = (await this.api.getTeam(favorite.tournamentSlug, favorite.teamId)).matches;
          } catch {
            return;
          }
          resolved.add(key);
          for (const match of matches) {
            const start = match.timeSlot?.startTime;
            if (!start || match.status !== 'SCHEDULED') {
              continue;
            }
            const at = new Date(new Date(start).getTime() - prefs.reminderMinutes * 60_000);
            if (at.getTime() > Date.now()) {
              candidates.push({ favorite, match, prefs, at });
            }
          }
        }),
      );

      const { notifications: pending } = await LocalNotifications.getPending();
      const stale = pending.filter((notification) => {
        const extra = notification.extra as Partial<ReminderExtra> | undefined;
        return (
          extra?.kind === 'reminder' &&
          typeof extra.teamKey === 'string' &&
          (!favoriteKeys.has(extra.teamKey) || resolved.has(extra.teamKey))
        );
      });
      if (stale.length > 0) {
        await LocalNotifications.cancel({
          notifications: stale.map((notification) => ({ id: notification.id })),
        });
      }

      // One reminder per match even when both teams are favorites.
      const seen = new Set<string>();
      const toSchedule = candidates
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .filter(({ match }) => (seen.has(match.id) ? false : !!seen.add(match.id)))
        .slice(0, Math.max(0, MAX_PENDING_REMINDERS - (pending.length - stale.length)));
      if (toSchedule.length === 0) {
        return;
      }
      await LocalNotifications.schedule({
        notifications: toSchedule.map(({ favorite, match, prefs, at }) => {
          const extra: ReminderExtra = {
            kind: 'reminder',
            slug: favorite.tournamentSlug,
            teamId: favorite.teamId,
            teamKey: this.keyOf(favorite),
            matchId: match.id,
          };
          return {
            id: reminderId(match.id),
            title: TITLE,
            body: notificationBody(language, 'reminder', {
              home: match.homeTeam?.name,
              away: match.awayTeam?.name,
              minutes: prefs.reminderMinutes,
              field: match.timeSlot?.field?.name ?? null,
            }),
            schedule: { at, allowWhileIdle: true },
            threadIdentifier: favorite.tournamentSlug,
            extra,
            ...this.delivery(prefs),
          };
        }),
      });
    } catch {
      // Permission not granted, or unsupported platform -- no-op.
    }
  }

  /**
   * Sound and, on Android, the channel that carries it. iOS plays a sound
   * only when one is named; 'default' isn't a file in the bundle, so the
   * system falls back to its standard notification sound.
   */
  private delivery(prefs: NotificationPrefs): { sound?: string; channelId: string } {
    return prefs.sound
      ? { sound: 'default', channelId: CHANNEL_ALERTS }
      : { channelId: CHANNEL_SILENT };
  }

  /**
   * Android decides sound and pop-up per channel: one with sound and a
   * heads-up banner, one low-importance silent channel (no pop-up -- Android
   * has no "banner without sound" through this plugin).
   */
  private async createAndroidChannels(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') {
      return;
    }
    const names = channelNames(this.languageService.language());
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ALERTS,
        name: names.alerts,
        importance: 4,
        visibility: 1,
        vibration: true,
      });
      await LocalNotifications.createChannel({
        id: CHANNEL_SILENT,
        name: names.silent,
        importance: 2,
        visibility: 1,
      });
    } catch {
      // Channels are best-effort: without them Android uses its default one.
    }
  }

  private openFromNotification(extra: unknown): void {
    const { slug, teamId } = (extra ?? {}) as { slug?: unknown; teamId?: unknown };
    if (typeof slug !== 'string' || !slug) {
      return;
    }
    void this.router.navigate(
      typeof teamId === 'string' && teamId ? ['/', slug, 'team', teamId] : ['/', slug],
    );
  }

  private keyOf(favorite: FavoriteTeam): string {
    return this.settings.teamKey(favorite.tournamentSlug, favorite.teamId);
  }
}

/** Stable 31-bit ID per match, so re-scheduling replaces the old reminder instead of duplicating it. */
function reminderId(matchId: string): number {
  let hash = 0;
  for (const char of matchId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 900_000_000;
  }
  return 1_000_000 + hash;
}
