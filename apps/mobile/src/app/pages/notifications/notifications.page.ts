import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { FavoriteTeam, FavoritesService } from '../../core/favorites.service';
import {
  NotificationPermissionState,
  NotificationsService,
} from '../../core/notifications.service';
import {
  NotificationPrefs,
  NotificationSettingsService,
} from '../../core/notification-settings.service';
import { Logo } from 'design-system';
import { NotificationPrefsForm } from './notification-prefs-form';

/**
 * Notification settings: the global ones, a permission/test block (to see how
 * a banner looks on the lock screen and with the app open), and an optional
 * set of settings per favorite team. Reached from the home screen's
 * Paramètres panel.
 */
@Component({
  selector: 'app-notifications-page',
  imports: [
    Logo,
    IonButton,
    IonContent,
    IonHeader,
    IonTitle,
    IonToggle,
    IonToolbar,
    NotificationPrefsForm,
    TranslocoPipe,
  ],
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage {
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationsService);
  private readonly settings = inject(NotificationSettingsService);
  private readonly favoritesService = inject(FavoritesService);

  protected readonly globalPrefs = this.settings.global;
  protected readonly favorites = this.favoritesService.favorites;
  protected readonly platform = Capacitor.getPlatform();

  protected readonly permission = signal<NotificationPermissionState>('prompt');
  protected readonly testState = signal<'idle' | 'sent' | 'denied'>('idle');

  constructor() {
    void this.refreshPermission();
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/');
  }

  protected setGlobal(patch: Partial<NotificationPrefs>): void {
    this.settings.setGlobal(patch);
  }

  protected teamPrefs(favorite: FavoriteTeam): NotificationPrefs {
    return this.settings.prefsFor(favorite.tournamentSlug, favorite.teamId);
  }

  protected hasOwnSettings(favorite: FavoriteTeam): boolean {
    return this.settings.hasTeamOverride(favorite.tournamentSlug, favorite.teamId);
  }

  protected setOwnSettings(favorite: FavoriteTeam, event: Event): void {
    const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked;
    if (checked === this.hasOwnSettings(favorite)) {
      return;
    }
    if (checked) {
      this.settings.setTeam(favorite.tournamentSlug, favorite.teamId, {});
    } else {
      this.settings.clearTeam(favorite.tournamentSlug, favorite.teamId);
    }
  }

  protected setTeam(favorite: FavoriteTeam, patch: Partial<NotificationPrefs>): void {
    this.settings.setTeam(favorite.tournamentSlug, favorite.teamId, patch);
  }

  protected async allow(): Promise<void> {
    await this.notifications.requestPermission();
    await this.refreshPermission();
  }

  protected async sendTest(): Promise<void> {
    this.testState.set((await this.notifications.sendTest()) ? 'sent' : 'denied');
    await this.refreshPermission();
  }

  private async refreshPermission(): Promise<void> {
    this.permission.set(await this.notifications.permissionState());
  }
}
