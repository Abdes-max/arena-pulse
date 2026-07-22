import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Badge, BadgeStatus, Button } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { Tournament, TournamentStatus } from '../../core/models';
import { TournamentsService } from '../../core/tournaments.service';

const STATUS_TO_BADGE: Record<TournamentStatus, BadgeStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
};

@Component({
  selector: 'app-tournament-list-page',
  imports: [Badge, Button],
  templateUrl: './tournament-list.page.html',
  styleUrl: './tournament-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentListPage {
  private readonly tournamentsService = inject(TournamentsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly statusBadge = STATUS_TO_BADGE;

  protected readonly tournaments = signal<Tournament[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      this.tournaments.set(await this.tournamentsService.listTournaments(organizationId));
    } catch {
      this.errorMessage.set('Impossible de charger les tournois.');
    } finally {
      this.loading.set(false);
    }
  }

  protected goToCreate(): void {
    void this.router.navigateByUrl('/tournaments/new');
  }

  protected editTournament(tournament: Tournament): void {
    void this.router.navigate(['/tournaments', tournament.id]);
  }

  protected async duplicate(tournament: Tournament): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.tournamentsService.duplicate(organizationId, tournament.id);
      await this.load();
    } catch {
      this.errorMessage.set('Impossible de dupliquer ce tournoi.');
    }
  }

  protected async toggleArchive(tournament: Tournament): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      if (tournament.status === 'ARCHIVED') {
        await this.tournamentsService.unarchive(organizationId, tournament.id);
      } else {
        await this.tournamentsService.archive(organizationId, tournament.id);
      }
      await this.load();
    } catch {
      this.errorMessage.set("Impossible de modifier l'état de ce tournoi.");
    }
  }
}
