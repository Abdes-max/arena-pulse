import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Match } from './models';

export interface GenerateSchedulePayload {
  fieldIds: string[];
  startDateTime: string;
  matchDurationMinutes?: number;
  breakDurationMinutes?: number;
  refereesPerMatch?: number;
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}`;
  }

  generateSchedule(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    payload: GenerateSchedulePayload,
  ): Promise<Match[]> {
    return firstValueFrom(
      this.http.post<Match[]>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/generate-schedule`,
        payload,
      ),
    );
  }

  resetSchedule(organizationId: string, tournamentId: string, phaseId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/schedule`,
      ),
    );
  }

  listMatches(organizationId: string, tournamentId: string, phaseId: string): Promise<Match[]> {
    return firstValueFrom(
      this.http.get<Match[]>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/matches`,
      ),
    );
  }
}
