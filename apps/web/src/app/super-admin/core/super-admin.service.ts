import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  SuperAdminOrganizationDetail,
  SuperAdminOrganizationRow,
  SuperAdminPaymentRow,
  SuperAdminStats,
  SuperAdminTournamentDetail,
  SuperAdminTournamentRow,
  SuperAdminUserRow,
} from './models';

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/super-admin`;

  getStats(): Promise<SuperAdminStats> {
    return firstValueFrom(this.http.get<SuperAdminStats>(`${this.base}/stats`));
  }

  listOrganizations(): Promise<SuperAdminOrganizationRow[]> {
    return firstValueFrom(this.http.get<SuperAdminOrganizationRow[]>(`${this.base}/organizations`));
  }

  getOrganization(organizationId: string): Promise<SuperAdminOrganizationDetail> {
    return firstValueFrom(
      this.http.get<SuperAdminOrganizationDetail>(`${this.base}/organizations/${organizationId}`),
    );
  }

  suspendOrganization(organizationId: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/organizations/${organizationId}/suspend`, {}),
    );
  }

  reactivateOrganization(organizationId: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/organizations/${organizationId}/reactivate`, {}),
    );
  }

  /** Deletes the organization and everything under it (tournaments, teams, players, etc.) -- unconditional, no "last admin" guard (see SuperAdminOrganizationsService.deleteOrganizationCascade server-side). */
  deleteOrganization(organizationId: string, confirmation: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/organizations/${organizationId}`, {
        body: { confirmation },
      }),
    );
  }

  listUsers(): Promise<SuperAdminUserRow[]> {
    return firstValueFrom(this.http.get<SuperAdminUserRow[]>(`${this.base}/users`));
  }

  verifyUserEmail(userId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/users/${userId}/verify-email`, {}));
  }

  /** Cascades any organization this account is the sole member of; blocked (409) if it's the last admin of a multi-member organization. */
  deleteUser(userId: string, confirmation: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/users/${userId}`, { body: { confirmation } }),
    );
  }

  listTournaments(): Promise<SuperAdminTournamentRow[]> {
    return firstValueFrom(this.http.get<SuperAdminTournamentRow[]>(`${this.base}/tournaments`));
  }

  getTournament(tournamentId: string): Promise<SuperAdminTournamentDetail> {
    return firstValueFrom(
      this.http.get<SuperAdminTournamentDetail>(`${this.base}/tournaments/${tournamentId}`),
    );
  }

  deleteTournament(tournamentId: string, confirmation: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/tournaments/${tournamentId}`, {
        body: { confirmation },
      }),
    );
  }

  /** Cascades the team's players (Prisma onDelete: Cascade). */
  deleteTeam(tournamentId: string, teamId: string, confirmation: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/tournaments/${tournamentId}/teams/${teamId}`, {
        body: { confirmation },
      }),
    );
  }

  deletePlayer(
    tournamentId: string,
    teamId: string,
    playerId: string,
    confirmation: string,
  ): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base}/tournaments/${tournamentId}/teams/${teamId}/players/${playerId}`,
        { body: { confirmation } },
      ),
    );
  }

  listPayments(): Promise<SuperAdminPaymentRow[]> {
    return firstValueFrom(this.http.get<SuperAdminPaymentRow[]>(`${this.base}/payments`));
  }

  annotatePayment(type: string, id: string, note: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/payments/${type}/${id}/annotate`, { note }),
    );
  }
}
