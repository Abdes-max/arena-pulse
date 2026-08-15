import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, BadgeStatus } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminTournamentRow } from '../../core/models';

const STATUS_TO_BADGE: Record<string, BadgeStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
};

@Component({
  selector: 'app-super-admin-tournaments-page',
  imports: [RouterLink, Badge],
  templateUrl: './super-admin-tournaments.page.html',
  styleUrl: './super-admin-tournaments.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminTournamentsPage {
  private readonly superAdminService = inject(SuperAdminService);

  protected readonly statusBadge = STATUS_TO_BADGE;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly tournaments = signal<SuperAdminTournamentRow[]>([]);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.tournaments.set(await this.superAdminService.listTournaments());
    } catch {
      this.errorMessage.set('Impossible de charger les tournois.');
    } finally {
      this.loading.set(false);
    }
  }
}
