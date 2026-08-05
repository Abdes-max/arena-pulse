import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TournamentDetail } from '../../core/models';
import { TournamentsService } from '../../core/tournaments.service';

// The Stripe webhook that confirms payment usually lands within a second or
// two of the checkout redirect landing here -- a short poll covers that gap,
// same pattern as register-success.page.ts for the player registration flow.
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
