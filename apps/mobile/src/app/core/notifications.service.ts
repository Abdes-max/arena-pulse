import { Injectable, inject } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PublicApiService } from 'api-client';
import { Match, MatchStatus } from 'shared-models';
import { FavoriteTeam } from './favorites.service';

interface TrackedMatchState {
  status: MatchStatus;
  scoreKey: string | null;
}

/**
 * Local-only "push" approximation (docs/product/user-stories.md: notify when
 * a favorited team's score changes). There's no backend/FCM infrastructure
 * for this app -- no mobile auth means no reliable device-token-to-user
 * mapping -- so these are scheduled natively via @capacitor/local-notifications
 * off data the app already has, and only fire while the app is actually
 * running (foreground or backgrounded), never when fully closed like a real
 * server push would.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(PublicApiService);
  private readonly lastSeen = new Map<string, TrackedMatchState>();
  private nextNotificationId = 1;

  async requestPermission(): Promise<void> {
    try {
      await LocalNotifications.requestPermissions();
    } catch {
      // Best-effort: denied/unsupported (e.g. an unsupported desktop browser
      // during dev) just means later schedule() calls silently no-op too.
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

    for (const match of matches) {
      const current: TrackedMatchState = {
        status: match.status,
        scoreKey: match.score ? `${match.score.homeScore}-${match.score.awayScore}` : null,
      };
      const previous = this.lastSeen.get(match.id);
      this.lastSeen.set(match.id, current);
      if (!previous) {
        continue; // First sighting of this match -- establishes the baseline, doesn't notify.
      }
      if (previous.status !== 'LIVE' && current.status === 'LIVE') {
        void this.notify(`${favorite.teamName} — le match a commencé`);
      } else if (current.scoreKey && current.scoreKey !== previous.scoreKey) {
        void this.notify(this.scoreMessage(match));
      }
    }
  }

  private scoreMessage(match: Match): string {
    const home = match.homeTeam?.name ?? '?';
    const away = match.awayTeam?.name ?? '?';
    return `${home} ${match.score?.homeScore} - ${match.score?.awayScore} ${away}`;
  }

  private async notify(body: string): Promise<void> {
    try {
      await LocalNotifications.schedule({
        notifications: [{ id: this.nextNotificationId++, title: 'Arena Pulse', body }],
      });
    } catch {
      // Permission not granted, or unsupported platform -- no-op.
    }
  }
}
