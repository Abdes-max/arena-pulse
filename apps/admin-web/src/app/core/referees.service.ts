import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Referee } from './models';

export interface CreateRefereePayload {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

export interface UpdateRefereePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

@Injectable({ providedIn: 'root' })
export class RefereesService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}/referees`;
  }

  listReferees(organizationId: string, tournamentId: string): Promise<Referee[]> {
    return firstValueFrom(this.http.get<Referee[]>(this.base(organizationId, tournamentId)));
  }

  createReferee(
    organizationId: string,
    tournamentId: string,
    payload: CreateRefereePayload,
  ): Promise<Referee> {
    return firstValueFrom(
      this.http.post<Referee>(this.base(organizationId, tournamentId), payload),
    );
  }

  updateReferee(
    organizationId: string,
    tournamentId: string,
    refereeId: string,
    payload: UpdateRefereePayload,
  ): Promise<Referee> {
    return firstValueFrom(
      this.http.patch<Referee>(`${this.base(organizationId, tournamentId)}/${refereeId}`, payload),
    );
  }

  deleteReferee(organizationId: string, tournamentId: string, refereeId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/${refereeId}`),
    );
  }
}
