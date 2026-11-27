import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  OrganizerRegistration,
  RegistrationPaymentStatus,
  RegistrationSettings,
} from 'shared-models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RegistrationsService {
  private readonly http = inject(HttpClient);

  listRegistrations(
    organizationId: string,
    tournamentId: string,
  ): Promise<OrganizerRegistration[]> {
    return firstValueFrom(
      this.http.get<OrganizerRegistration[]>(
        `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}/registrations`,
      ),
    );
  }

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}/registrations`;
  }

  getSettings(organizationId: string, tournamentId: string): Promise<RegistrationSettings> {
    return firstValueFrom(
      this.http.get<RegistrationSettings>(`${this.base(organizationId, tournamentId)}/settings`),
    );
  }

  updateSettings(
    organizationId: string,
    tournamentId: string,
    patch: Partial<{
      open: boolean;
      opensAt: string | null;
      closesAt: string | null;
      paymentInfo: string | null;
      maxTeamsPerRegistrant: number;
      clubDirectoryOnly: boolean;
    }>,
  ): Promise<RegistrationSettings> {
    return firstValueFrom(
      this.http.patch<RegistrationSettings>(
        `${this.base(organizationId, tournamentId)}/settings`,
        patch,
      ),
    );
  }

  confirm(
    organizationId: string,
    tournamentId: string,
    id: string,
  ): Promise<OrganizerRegistration[]> {
    return firstValueFrom(
      this.http.post<OrganizerRegistration[]>(
        `${this.base(organizationId, tournamentId)}/${id}/confirm`,
        {},
      ),
    );
  }

  waitlist(
    organizationId: string,
    tournamentId: string,
    id: string,
  ): Promise<OrganizerRegistration[]> {
    return firstValueFrom(
      this.http.post<OrganizerRegistration[]>(
        `${this.base(organizationId, tournamentId)}/${id}/waitlist`,
        {},
      ),
    );
  }

  reject(
    organizationId: string,
    tournamentId: string,
    id: string,
    reason: string | undefined,
  ): Promise<OrganizerRegistration[]> {
    return firstValueFrom(
      this.http.post<OrganizerRegistration[]>(
        `${this.base(organizationId, tournamentId)}/${id}/reject`,
        {
          reason,
        },
      ),
    );
  }

  setPayment(
    organizationId: string,
    tournamentId: string,
    id: string,
    paymentStatus: RegistrationPaymentStatus,
  ): Promise<OrganizerRegistration[]> {
    return firstValueFrom(
      this.http.patch<OrganizerRegistration[]>(
        `${this.base(organizationId, tournamentId)}/${id}/payment`,
        {
          paymentStatus,
        },
      ),
    );
  }
}
