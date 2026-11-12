import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PublicApiService } from 'api-client';
import { Button } from 'design-system';
import { PlayerRegistration } from 'shared-models';

/** A player's own pre-registrations across tournaments, with their status; pending ones can be withdrawn. */
@Component({
  selector: 'app-my-registrations-page',
  imports: [Button, RouterLink, TranslocoPipe],
  templateUrl: './my-registrations.page.html',
  styleUrl: './my-registrations.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyRegistrationsPage {
  private readonly api = inject(PublicApiService);

  protected readonly loading = signal(true);
  protected readonly busyId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly registrations = signal<PlayerRegistration[]>([]);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.registrations.set(await this.api.listMyRegistrations());
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
    this.errorMessage.set(null);
    try {
      this.registrations.set(await this.api.cancelRegistration(registration.id));
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse
          ? (error.error as { message?: unknown } | null)?.message
          : null;
      this.errorMessage.set(
        typeof message === 'string' ? message : 'myRegistrations.errors.cancel',
      );
    } finally {
      this.busyId.set(null);
    }
  }
}
