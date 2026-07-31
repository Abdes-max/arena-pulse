import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Match } from './models';

export interface UpsertMatchScorePayload {
  homeScore: number;
  awayScore: number;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
}

@Injectable({ providedIn: 'root' })
export class ScoresService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}`;
  }

  upsertScore(
    organizationId: string,
    tournamentId: string,
    matchId: string,
    payload: UpsertMatchScorePayload,
  ): Promise<Match> {
    return firstValueFrom(
      this.http.put<Match>(
        `${this.base(organizationId, tournamentId)}/matches/${matchId}/score`,
        payload,
      ),
    );
  }

  validateScore(organizationId: string, tournamentId: string, matchId: string): Promise<Match> {
    return firstValueFrom(
      this.http.post<Match>(
        `${this.base(organizationId, tournamentId)}/matches/${matchId}/score/validate`,
        {},
      ),
    );
  }

  clearScore(organizationId: string, tournamentId: string, matchId: string): Promise<Match> {
    return firstValueFrom(
      this.http.delete<Match>(
        `${this.base(organizationId, tournamentId)}/matches/${matchId}/score`,
      ),
    );
  }

  declareForfeit(
    organizationId: string,
    tournamentId: string,
    matchId: string,
    teamId: string,
  ): Promise<Match> {
    return firstValueFrom(
      this.http.post<Match>(
        `${this.base(organizationId, tournamentId)}/matches/${matchId}/forfeit`,
        {
          teamId,
        },
      ),
    );
  }

  undoForfeit(organizationId: string, tournamentId: string, matchId: string): Promise<Match> {
    return firstValueFrom(
      this.http.delete<Match>(
        `${this.base(organizationId, tournamentId)}/matches/${matchId}/forfeit`,
      ),
    );
  }
}
