import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Sponsor } from './models';

export interface CreateSponsorPayload {
  name: string;
  linkUrl?: string;
}

export interface UpdateSponsorPayload {
  name?: string;
  linkUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class SponsorsService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}/sponsors`;
  }

  list(organizationId: string, tournamentId: string): Promise<Sponsor[]> {
    return firstValueFrom(this.http.get<Sponsor[]>(this.base(organizationId, tournamentId)));
  }

  create(
    organizationId: string,
    tournamentId: string,
    payload: CreateSponsorPayload,
  ): Promise<Sponsor> {
    return firstValueFrom(
      this.http.post<Sponsor>(this.base(organizationId, tournamentId), payload),
    );
  }

  update(
    organizationId: string,
    tournamentId: string,
    sponsorId: string,
    payload: UpdateSponsorPayload,
  ): Promise<Sponsor> {
    return firstValueFrom(
      this.http.patch<Sponsor>(`${this.base(organizationId, tournamentId)}/${sponsorId}`, payload),
    );
  }

  remove(organizationId: string, tournamentId: string, sponsorId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/${sponsorId}`),
    );
  }

  uploadLogo(
    organizationId: string,
    tournamentId: string,
    sponsorId: string,
    file: File,
  ): Promise<Sponsor> {
    const formData = new FormData();
    formData.append('logo', file);
    return firstValueFrom(
      this.http.post<Sponsor>(
        `${this.base(organizationId, tournamentId)}/${sponsorId}/logo`,
        formData,
      ),
    );
  }

  removeLogo(organizationId: string, tournamentId: string, sponsorId: string): Promise<Sponsor> {
    return firstValueFrom(
      this.http.delete<Sponsor>(`${this.base(organizationId, tournamentId)}/${sponsorId}/logo`),
    );
  }
}
