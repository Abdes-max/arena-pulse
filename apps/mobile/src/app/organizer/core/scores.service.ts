import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Match } from 'shared-models';
import { environment } from '../../../environments/environment';
import { OrganizerStandingRule } from './models';

export interface UpsertMatchScorePayload {
  homeScore: number;
  awayScore: number;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
}

// Mirrors apps/web/src/app/admin/core/scores.service.ts against the same
// already-existing endpoints (scores.controller.ts) -- no backend change
// for PR 4 (Scores + Classements, native mobile).
@Injectable({ providedIn: 'root' })
export class OrganizerScoresService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}`;
  }

  /**
   * Full Match[] (score/status/officials included) for one phase -- distinct
   * from TournamentCreationService.listMatches's trimmed MatchSummary, which
   * the wizard's read-only calendar step summary never needed more than.
   */
  listMatches(organizationId: string, tournamentId: string, phaseId: string): Promise<Match[]> {
    return firstValueFrom(
      this.http.get<Match[]>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/matches`,
      ),
    );
  }

  getStandingRule(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<OrganizerStandingRule> {
    return firstValueFrom(
      this.http.get<OrganizerStandingRule>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/standing-rule`,
      ),
    );
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
        { teamId },
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
