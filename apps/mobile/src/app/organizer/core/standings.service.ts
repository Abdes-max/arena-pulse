import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Match, Qualification, Standings } from 'shared-models';
import { environment } from '../../../environments/environment';

// Mirrors apps/web/src/app/admin/core/competition-formats.service.ts's own
// CrossGroupUnresolvedTie (not in shared-models -- admin/organizer-app
// concern, same convention as models.ts's top comment).
export interface CrossGroupUnresolvedTie {
  ruleId: string;
  targetPhaseName: string;
  position: number;
  ties: { teams: { id: string; name: string; groupName: string }[] }[];
}

// Mirrors apps/web/src/app/admin/core/standings.service.ts (getStandings/
// getQualifications/tie-break-choice) plus the cross-group qualification
// endpoints that live on admin's competition-formats.service.ts -- grouped
// here instead since on mobile they're only ever used together, by the one
// standings page. Same already-existing endpoints, no backend change for
// PR 4 (Scores + Classements, native mobile).
@Injectable({ providedIn: 'root' })
export class OrganizerStandingsService {
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

  listBracketMatches(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
  ): Promise<Match[]> {
    return firstValueFrom(
      this.http.get<Match[]>(
        `${this.base(organizationId, tournamentId)}/knockout-brackets/${bracketId}/matches`,
      ),
    );
  }

  getCrossGroupUnresolvedTies(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
  ): Promise<CrossGroupUnresolvedTie[]> {
    return firstValueFrom(
      this.http.get<CrossGroupUnresolvedTie[]>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/cross-group-qualification-rules/unresolved-ties`,
      ),
    );
  }

  setCrossGroupTieBreakChoice(
    organizationId: string,
    tournamentId: string,
    ruleId: string,
    teamId: string,
  ): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${this.base(organizationId, tournamentId)}/cross-group-qualification-rules/${ruleId}/tie-break-choice`,
        { teamId },
      ),
    );
  }

  clearCrossGroupTieBreakChoice(
    organizationId: string,
    tournamentId: string,
    ruleId: string,
  ): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId, tournamentId)}/cross-group-qualification-rules/${ruleId}/tie-break-choice`,
      ),
    );
  }
}
