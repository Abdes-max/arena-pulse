import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Qualification, Standings } from './models';

@Injectable({ providedIn: 'root' })
export class StandingsService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}`;
  }

  getStandings(organizationId: string, tournamentId: string, groupId: string): Promise<Standings> {
    return firstValueFrom(
      this.http.get<Standings>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/standings`,
      ),
    );
  }

  getQualifications(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<Qualification[]> {
    return firstValueFrom(
      this.http.get<Qualification[]>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/qualifications`,
      ),
    );
  }

  setTieBreakChoice(
    organizationId: string,
    tournamentId: string,
    groupId: string,
    teamId: string,
  ): Promise<Standings> {
    return firstValueFrom(
      this.http.post<Standings>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/tie-break-choice`,
        { teamId },
      ),
    );
  }

  clearTieBreakChoice(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<Standings> {
    return firstValueFrom(
      this.http.delete<Standings>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/tie-break-choice`,
      ),
    );
  }
}
