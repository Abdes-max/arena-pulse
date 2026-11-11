import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CompetitionGroup, CompetitionPhase, KnockoutBracket } from 'shared-models';
import { environment } from '../../../environments/environment';

/** A team with the pool it sits in (the API's team summary carries groupId). */
export interface StructureTeam {
  id: string;
  name: string;
  categoryId: string;
  groupId: string | null;
}

export interface StructureStandingRule {
  groupId: string;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  tieBreakOrder: string[];
  supplementaryStandingEnabled: boolean;
  penaltyShootoutEnabled: boolean;
}

export interface StructureQualificationRule {
  id: string;
  groupId: string;
  fromPosition: number;
  toPosition: number;
  targetPhaseId: string;
}

/** Round 1 of a bracket: qualifier labels and who meets whom (positions 2k and 2k+1 play match k). */
export interface BracketFirstRound {
  bracketId: string;
  size: number;
  qualifiers: string[];
  order: number[];
  custom: boolean;
  locked: boolean;
}

/**
 * The Structure screen's calls -- the same organizer endpoints as
 * apps/web's CompetitionFormatsService/TeamsService (pools, brackets,
 * qualification rules, first-round pairing), narrowed to what this screen
 * edits.
 */
@Injectable({ providedIn: 'root' })
export class OrganizerStructureService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}`;
  }

  listPhases(organizationId: string, tournamentId: string, categoryId: string) {
    return firstValueFrom(
      this.http.get<CompetitionPhase[]>(
        `${this.base(organizationId, tournamentId)}/categories/${categoryId}/phases`,
      ),
    );
  }

  createPhase(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    payload: { name: string; type: 'GROUP_STAGE' | 'KNOCKOUT'; position: number },
  ) {
    return firstValueFrom(
      this.http.post<CompetitionPhase>(
        `${this.base(organizationId, tournamentId)}/categories/${categoryId}/phases`,
        payload,
      ),
    );
  }

  deletePhase(organizationId: string, tournamentId: string, phaseId: string) {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/phases/${phaseId}`),
    );
  }

  listTeams(organizationId: string, tournamentId: string, categoryId: string) {
    return firstValueFrom(
      this.http.get<StructureTeam[]>(`${this.base(organizationId, tournamentId)}/teams`, {
        params: { categoryId },
      }),
    );
  }

  assignGroup(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    groupId: string | null,
  ) {
    return firstValueFrom(
      this.http.patch<StructureTeam>(
        `${this.base(organizationId, tournamentId)}/teams/${teamId}/group`,
        { groupId },
      ),
    );
  }

  createGroup(organizationId: string, tournamentId: string, phaseId: string, name: string) {
    return firstValueFrom(
      this.http.post<CompetitionGroup>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/groups`,
        { name },
      ),
    );
  }

  deleteGroup(organizationId: string, tournamentId: string, groupId: string) {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/groups/${groupId}`),
    );
  }

  getStandingRule(organizationId: string, tournamentId: string, groupId: string) {
    return firstValueFrom(
      this.http.get<StructureStandingRule>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/standing-rule`,
      ),
    );
  }

  updateStandingRule(
    organizationId: string,
    tournamentId: string,
    groupId: string,
    payload: Omit<StructureStandingRule, 'groupId'>,
  ) {
    return firstValueFrom(
      this.http.put<StructureStandingRule>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/standing-rule`,
        payload,
      ),
    );
  }

  listQualificationRules(organizationId: string, tournamentId: string, groupId: string) {
    return firstValueFrom(
      this.http.get<StructureQualificationRule[]>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/qualification-rules`,
      ),
    );
  }

  createQualificationRule(
    organizationId: string,
    tournamentId: string,
    groupId: string,
    payload: { fromPosition: number; toPosition: number; targetPhaseId: string },
  ) {
    return firstValueFrom(
      this.http.post<StructureQualificationRule>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/qualification-rules`,
        payload,
      ),
    );
  }

  deleteQualificationRule(organizationId: string, tournamentId: string, ruleId: string) {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId, tournamentId)}/qualification-rules/${ruleId}`,
      ),
    );
  }

  createBracket(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    payload: { name: string; size: number; hasRankingMatch: boolean },
  ) {
    return firstValueFrom(
      this.http.post<KnockoutBracket>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/knockout-bracket`,
        payload,
      ),
    );
  }

  updateBracket(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
    payload: { hasRankingMatch: boolean },
  ) {
    return firstValueFrom(
      this.http.patch<KnockoutBracket>(
        `${this.base(organizationId, tournamentId)}/knockout-brackets/${bracketId}`,
        payload,
      ),
    );
  }

  deleteBracket(organizationId: string, tournamentId: string, bracketId: string) {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId, tournamentId)}/knockout-brackets/${bracketId}`,
      ),
    );
  }

  getFirstRound(organizationId: string, tournamentId: string, bracketId: string) {
    return firstValueFrom(
      this.http.get<BracketFirstRound>(
        `${this.base(organizationId, tournamentId)}/knockout-brackets/${bracketId}/first-round`,
      ),
    );
  }

  setFirstRound(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
    order: number[] | null,
  ) {
    return firstValueFrom(
      this.http.patch<BracketFirstRound>(
        `${this.base(organizationId, tournamentId)}/knockout-brackets/${bracketId}/first-round`,
        { order },
      ),
    );
  }
}
