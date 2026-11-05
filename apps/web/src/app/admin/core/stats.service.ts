import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OrganizationDashboardStats, TournamentDashboardStats } from './models';

@Injectable({ providedIn: 'root' })
export class StatsService {
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
