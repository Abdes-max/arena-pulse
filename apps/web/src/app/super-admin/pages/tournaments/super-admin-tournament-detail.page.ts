import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Badge, BadgeStatus } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminTournamentDetail } from '../../core/models';

const STATUS_TO_BADGE: Record<string, BadgeStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
};

const MATCH_STATUS_TO_BADGE: Record<string, BadgeStatus> = {
  SCHEDULED: 'upcoming',
  LIVE: 'live',
  COMPLETED: 'finished',
  POSTPONED: 'postponed',
  CANCELLED: 'cancelled',
  FORFEITED: 'cancelled',
};

@Component({
  selector: 'app-super-admin-tournament-detail-page',
  imports: [RouterLink, Badge],
  templateUrl: './super-admin-tournament-detail.page.html',
  styleUrl: './super-admin-tournament-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminTournamentDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly superAdminService = inject(SuperAdminService);

  private readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly statusBadge = STATUS_TO_BADGE;
  protected readonly matchStatusBadge = MATCH_STATUS_TO_BADGE;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly tournament = signal<SuperAdminTournamentDetail | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.tournament.set(await this.superAdminService.getTournament(this.tournamentId));
    } catch {
      this.errorMessage.set('Impossible de charger ce tournoi.');
    } finally {
      this.loading.set(false);
    }
  }
}
