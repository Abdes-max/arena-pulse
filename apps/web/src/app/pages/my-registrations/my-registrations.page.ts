import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PublicApiService } from 'api-client';
import { Button, Logo, StatsDatum, StatsSegments } from 'design-system';
import { PlayerRegistration, PlayerRegistrationStats } from 'shared-models';
import { showErrorsInSnackbar } from '../../core/error-snackbar';
import { PlayerAuthService } from '../../core/player-auth.service';

/**
 * The team manager's space: how the teams they registered did (same tiles
 * and charts as the organizer's Statistiques page) and their own
 * pre-registrations across tournaments, pending ones can be withdrawn.
 */
@Component({
  selector: 'app-my-registrations-page',
  imports: [Button, Logo, RouterLink, StatsSegments, TranslocoPipe],
  templateUrl: './my-registrations.page.html',
  styleUrls: ['../../admin/shared/stats-dashboard.scss', './my-registrations.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyRegistrationsPage {
  private readonly api = inject(PublicApiService);
  private readonly playerAuth = inject(PlayerAuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly player = this.playerAuth.currentPlayer;
  protected readonly loading = signal(true);
  protected readonly busyId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);
  protected readonly registrations = signal<PlayerRegistration[]>([]);
  protected readonly stats = signal<PlayerRegistrationStats | null>(null);

  protected readonly outcomes = computed<StatsDatum[]>(() => {
    const totals = this.stats()?.totals;
    if (!totals) {
      return [];
    }
    return [
      {
        label: this.transloco.translate('myRegistrations.table.wonLong'),
        value: totals.won,
        tone: 'success',
      },
      {
        label: this.transloco.translate('myRegistrations.table.drawnLong'),
        value: totals.drawn,
        tone: 'muted',
      },
      {
        label: this.transloco.translate('myRegistrations.table.lostLong'),
        value: totals.lost,
        tone: 'error',
      },
    ];
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [registrations, stats] = await Promise.all([
        this.api.listMyRegistrations(),
        this.api.getMyRegistrationStats(),
      ]);
      this.registrations.set(registrations);
      this.stats.set(stats);
    } catch {
      this.errorMessage.set('myRegistrations.errors.load');
    } finally {
      this.loading.set(false);
    }
  }

  protected cancellable(registration: PlayerRegistration): boolean {
    return registration.status === 'PENDING' || registration.status === 'WAITLIST';
  }

  protected async cancel(registration: PlayerRegistration): Promise<void> {
    this.busyId.set(registration.id);
    try {
      this.registrations.set(await this.api.cancelRegistration(registration.id));
      this.stats.set(await this.api.getMyRegistrationStats());
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse
          ? (error.error as { message?: unknown } | null)?.message
          : null;
      // The API's own message is shown by the snackbar as-is; otherwise a key.
      this.errorMessage.set(
        typeof message === 'string' ? message : 'myRegistrations.errors.cancel',
      );
    } finally {
      this.busyId.set(null);
    }
  }

  protected async logout(): Promise<void> {
    await this.playerAuth.logout();
    await this.router.navigateByUrl('/');
  }
}
