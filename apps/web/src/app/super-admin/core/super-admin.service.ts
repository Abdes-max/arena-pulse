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

  listUsers(): Promise<SuperAdminUserRow[]> {
    return firstValueFrom(this.http.get<SuperAdminUserRow[]>(`${this.base}/users`));
  }

  verifyUserEmail(userId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/users/${userId}/verify-email`, {}));
  }

  listTournaments(): Promise<SuperAdminTournamentRow[]> {
    return firstValueFrom(this.http.get<SuperAdminTournamentRow[]>(`${this.base}/tournaments`));
  }

  getTournament(tournamentId: string): Promise<SuperAdminTournamentDetail> {
    return firstValueFrom(
      this.http.get<SuperAdminTournamentDetail>(`${this.base}/tournaments/${tournamentId}`),
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
