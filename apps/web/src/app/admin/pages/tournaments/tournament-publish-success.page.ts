import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TournamentDetail } from '../../core/models';
import { TournamentsService } from '../../core/tournaments.service';

// Fallback only: confirmPublicationPayment (called first, see load() below)
// verifies the payment directly against Stripe using the session_id already
// on this page's own URL, so it's normally resolved before this poll loop
// ever runs. Kept as a safety net for the rare case that call itself fails
// (a transient network error, Stripe briefly unavailable) -- the webhook
// might still land shortly after even then.
const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

@Component({
  selector: 'app-tournament-publish-success-page',
  imports: [RouterLink],
  templateUrl: './tournament-publish-success.page.html',
  styleUrl: './tournament-publish-success.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentPublishSuccessPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  protected readonly tournamentId = computed(() => this.paramMap().get('tournamentId'));
  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);

  protected readonly loading = signal(true);
  protected readonly tournament = signal<TournamentDetail | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      this.loading.set(false);
      return;
    }
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (sessionId) {
      try {
        const tournament = await this.tournamentsService.confirmPublicationPayment(
          organizationId,
          tournamentId,
          sessionId,
        );
        this.tournament.set(tournament);
        if (tournament.status === 'PUBLISHED') {
          this.loading.set(false);
          return;
        }
      } catch {
        // Fall through to the poll loop below -- confirming ourselves
        // failed, but the webhook may still land shortly.
      }
    }
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const tournament = await this.tournamentsService.getTournament(organizationId, tournamentId);
      this.tournament.set(tournament);
      if (tournament.status === 'PUBLISHED') {
        break;
      }
      if (attempt < MAX_POLL_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
    this.loading.set(false);
  }
}
