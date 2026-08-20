import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Badge, BadgeStatus, Button, TypeToConfirm } from 'design-system';
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
  imports: [RouterLink, Badge, Button, TypeToConfirm],
  templateUrl: './super-admin-tournament-detail.page.html',
  styleUrl: './super-admin-tournament-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminTournamentDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly superAdminService = inject(SuperAdminService);

  private readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly statusBadge = STATUS_TO_BADGE;
  protected readonly matchStatusBadge = MATCH_STATUS_TO_BADGE;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly tournament = signal<SuperAdminTournamentDetail | null>(null);

  // Tournament-level danger zone -- same collapsed in-page-reveal pattern
  // as feat/171's account-deletion pages.
  protected readonly dangerZoneOpen = signal(false);
  protected readonly deletingTournament = signal(false);

  // Per-team disclosure (which team's players are expanded) and per-row
  // "type SUPPRIMER to confirm" state (team or player), one at a time --
  // same pattern as super-admin-users.page's deletingUserId. Kept separate
  // from the page-level errorMessage (which hides the whole page) so a
  // team/player delete failure shows inline instead.
  protected readonly expandedTeamId = signal<string | null>(null);
  protected readonly deletingTeamId = signal<string | null>(null);
  protected readonly deletingPlayerId = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly rowErrorMessage = signal<string | null>(null);

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

  protected openDangerZone(): void {
    this.dangerZoneOpen.set(true);
  }

  protected cancelTournamentDeletion(): void {
    this.dangerZoneOpen.set(false);
  }

  protected async deleteTournament(): Promise<void> {
    if (this.deletingTournament()) {
      return;
    }
    this.deletingTournament.set(true);
    try {
      // ap-type-to-confirm only emits (confirm) once the user has typed its
      // confirmWord (default "SUPPRIMER") -- safe to send literally here.
      await this.superAdminService.deleteTournament(this.tournamentId, 'SUPPRIMER');
      await this.router.navigate(['/super-admin/tournaments']);
    } catch {
      this.errorMessage.set('Impossible de supprimer ce tournoi.');
    } finally {
      this.deletingTournament.set(false);
    }
  }

  protected toggleTeam(teamId: string): void {
    this.expandedTeamId.set(this.expandedTeamId() === teamId ? null : teamId);
  }

  protected startDeletingTeam(teamId: string): void {
    this.deletingTeamId.set(teamId);
    this.deletingPlayerId.set(null);
    this.rowErrorMessage.set(null);
  }

  protected startDeletingPlayer(playerId: string): void {
    this.deletingPlayerId.set(playerId);
    this.deletingTeamId.set(null);
    this.rowErrorMessage.set(null);
  }

  protected cancelRowDeletion(): void {
    this.deletingTeamId.set(null);
    this.deletingPlayerId.set(null);
    this.rowErrorMessage.set(null);
  }

  protected async deleteTeam(teamId: string): Promise<void> {
    if (this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.rowErrorMessage.set(null);
    try {
      await this.superAdminService.deleteTeam(this.tournamentId, teamId, 'SUPPRIMER');
      this.tournament.update((t) =>
        t ? { ...t, teams: t.teams.filter((team) => team.id !== teamId) } : t,
      );
      this.deletingTeamId.set(null);
    } catch {
      this.rowErrorMessage.set('Impossible de supprimer cette équipe.');
    } finally {
      this.deleting.set(false);
    }
  }

  protected async deletePlayer(teamId: string, playerId: string): Promise<void> {
    if (this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.rowErrorMessage.set(null);
    try {
      await this.superAdminService.deletePlayer(this.tournamentId, teamId, playerId, 'SUPPRIMER');
      this.tournament.update((t) =>
        t
          ? {
              ...t,
              teams: t.teams.map((team) =>
                team.id === teamId
                  ? { ...team, players: team.players.filter((p) => p.id !== playerId) }
                  : team,
              ),
            }
          : t,
      );
      this.deletingPlayerId.set(null);
    } catch {
      this.rowErrorMessage.set('Impossible de supprimer ce·tte joueur·euse.');
    } finally {
      this.deleting.set(false);
    }
  }
}
