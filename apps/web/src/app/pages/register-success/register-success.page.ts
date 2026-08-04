import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicApiService } from 'api-client';
import { PlayerRegistration } from 'shared-models';
import { TournamentContextService } from '../../core/tournament-context.service';

// The Stripe webhook that confirms payment usually lands within a second or
// two of the checkout redirect landing here -- a short poll covers that gap
// without the visitor needing to manually reload. Gives up after this many
// tries and just shows whatever status came back last (PENDING_PAYMENT is
// still an honest answer, not an error).
const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

@Component({
  selector: 'app-register-success-page',
  imports: [RouterLink],
  templateUrl: './register-success.page.html',
  styleUrl: './register-success.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterSuccessPage {
  private readonly api = inject(PublicApiService);
  protected readonly context = inject(TournamentContextService);

  protected readonly loading = signal(true);
  protected readonly registration = signal<PlayerRegistration | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const registrations = await this.api.listMyRegistrations();
      const forThisTournament = registrations.find((r) => r.tournament.slug === slug);
      if (forThisTournament) {
        this.registration.set(forThisTournament);
        if (forThisTournament.status !== 'PENDING_PAYMENT') {
          break;
        }
      }
      if (attempt < MAX_POLL_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
    this.loading.set(false);
  }
}
