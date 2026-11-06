import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { OrganizationDashboardStats, TournamentDashboardStats } from 'shared-models';
import { environment } from '../../../environments/environment';

// Mirrors apps/web/src/app/admin/core/stats.service.ts -- same endpoints.
@Injectable({ providedIn: 'root' })
export class OrganizerStatsService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}`;
  }

  getOrganizationStats(organizationId: string): Promise<OrganizationDashboardStats> {
    return firstValueFrom(
      this.http.get<OrganizationDashboardStats>(`${this.base(organizationId)}/dashboard-stats`),
    );
  }

  getTournamentStats(
    organizationId: string,
    tournamentId: string,
  ): Promise<TournamentDashboardStats> {
    return firstValueFrom(
      this.http.get<TournamentDashboardStats>(
        `${this.base(organizationId)}/tournaments/${tournamentId}/stats`,
      ),
    );
  }
}
