import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicApiService } from 'api-client';
import { PlayerRegistration } from 'shared-models';
import { TournamentContextService } from '../../core/tournament-context.service';

// Fallback only: confirmRegistrationPayment (called first, see load() below)
// verifies the payment directly against Stripe using the session_id already
// on this page's own URL, so it's normally resolved before this poll loop
// ever runs. Kept as a safety net for the rare case that call itself fails
// (a transient network error, Stripe briefly unavailable) -- the webhook
// might still land shortly after even then. Gives up after this many tries
// and just shows whatever status came back last (PENDING_PAYMENT is still
// an honest answer, not an error).
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
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PublicApiService);
  protected readonly context = inject(TournamentContextService);

  protected readonly loading = signal(true);
  protected readonly registration = signal<PlayerRegistration | null>(null);

  constructor() {
    void this.load();
  }

  private findForThisTournament(
    registrations: PlayerRegistration[],
  ): PlayerRegistration | undefined {
    const slug = this.context.slug();
    return registrations.find((r) => r.tournament.slug === slug);
  }

  private async load(): Promise<void> {
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (sessionId) {
      try {
        const registrations = await this.api.confirmRegistrationPayment(sessionId);
        const forThisTournament = this.findForThisTournament(registrations);
        if (forThisTournament) {
          this.registration.set(forThisTournament);
          if (forThisTournament.status !== 'PENDING_PAYMENT') {
            this.loading.set(false);
            return;
          }
        }
      } catch {
        // Fall through to the poll loop below -- confirming ourselves
        // failed, but the webhook may still land shortly.
      }
    }
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const registrations = await this.api.listMyRegistrations();
      const forThisTournament = this.findForThisTournament(registrations);
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
