import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CompetitionGroup,
  CompetitionPhase,
  CompetitionPhaseType,
  CrossGroupQualificationRule,
  KnockoutBracket,
  Match,
  QualificationRule,
  StandingRule,
} from './models';

export interface CreatePhasePayload {
  name: string;
  type: CompetitionPhaseType;
  position?: number;
  doubleRoundRobin?: boolean;
}

export interface UpdatePhasePayload {
  doubleRoundRobin?: boolean;
}

export interface CreateGroupPayload {
  name: string;
  position?: number;
}

export interface UpdateStandingRulePayload {
  winPoints?: number;
  drawPoints?: number;
  lossPoints?: number;
  tieBreakOrder?: string[];
  supplementaryStandingEnabled?: boolean;
  penaltyShootoutEnabled?: boolean;
}

export interface CreateKnockoutBracketPayload {
  name: string;
  size: number;
  hasRankingMatch?: boolean;
}

export interface UpdateKnockoutBracketPayload {
  name?: string;
  size?: number;
  hasRankingMatch?: boolean;
}

export interface GenerateBracketMatchesPayload {
  // Round 1 only -- omit to leave it unscheduled (placed later by hand on
  // the Calendrier page's drag-and-drop editor), same as before this existed.
  fieldIds?: string[];
  startDateTime?: string;
  matchDurationMinutes?: number;
  breakDurationMinutes?: number;
}

export interface GenerateAllBracketMatchesPayload {
  fieldIds: string[];
  // The knockout stage's start usually isn't entered by hand -- it's
  // computed from the pool phase's last scheduled match plus this break.
  // Omit it and pass startDateTime instead for a category with no real pool
  // phase to derive it from (KNOCKOUT_ONLY structure preset).
  breakAfterPoolsMinutes?: number;
  startDateTime?: string;
  matchDurationMinutes?: number;
  breakDurationMinutes?: number;
}

export interface CreateQualificationRulePayload {
  fromPosition: number;
  toPosition: number;
  targetPhaseId: string;
}

export interface CreateCrossGroupQualificationRulePayload {
  position: number;
  bestCount: number;
  targetPhaseId: string;
}

export interface CrossGroupUnresolvedTie {
  ruleId: string;
  targetPhaseName: string;
  position: number;
  ties: { teams: { id: string; name: string; groupName: string }[] }[];
}

// Kept in sync by hand with StructurePresetFormat in
// apps/api/src/tournaments/dto/create-structure-preset.dto.ts.
export type StructurePresetFormat = 'POOLS_ONLY' | 'POOLS_AND_KNOCKOUT' | 'KNOCKOUT_ONLY';

export interface StructurePresetTierPayload {
  name: string;
  qualifiersPerPool: number;
  hasRankingMatch?: boolean;
}

export interface StructurePresetBestOfPositionPayload {
  position: number;
  bestCount: number;
}

export interface CreateStructurePresetPayload {
  format: StructurePresetFormat;
  teamCount: number;
  // Not sent for KNOCKOUT_ONLY -- no real pool phase in that format.
  poolCount?: number;
  // Only sent for POOLS_AND_KNOCKOUT.
  tiers?: StructurePresetTierPayload[];
  // Only relevant for KNOCKOUT_ONLY -- defaults to "Tableau final" server-side.
  knockoutName?: string;
  // Only relevant for KNOCKOUT_ONLY -- POOLS_AND_KNOCKOUT sets this per tier instead.
  hasRankingMatch?: boolean;
  bestOfPosition?: StructurePresetBestOfPositionPayload;
  matchDurationMinutes?: number;
  breakDurationMinutes?: number;
  refereesPerMatch?: number;
  doubleRoundRobin?: boolean;
}

export interface StructurePresetResult {
  groupPhaseId: string;
  tiers: { phaseId: string; name: string; bracketSize: number }[];
}

@Injectable({ providedIn: 'root' })
export class CompetitionFormatsService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}`;
  }

  listPhases(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
  ): Promise<CompetitionPhase[]> {
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
    payload: CreatePhasePayload,
  ): Promise<CompetitionPhase> {
    return firstValueFrom(
      this.http.post<CompetitionPhase>(
        `${this.base(organizationId, tournamentId)}/categories/${categoryId}/phases`,
        payload,
      ),
    );
  }

  updatePhase(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    payload: UpdatePhasePayload,
  ): Promise<CompetitionPhase> {
    return firstValueFrom(
      this.http.patch<CompetitionPhase>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}`,
        payload,
      ),
    );
  }

  deletePhase(organizationId: string, tournamentId: string, phaseId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/phases/${phaseId}`),
    );
  }

  createGroup(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    payload: CreateGroupPayload,
  ): Promise<CompetitionGroup> {
    return firstValueFrom(
      this.http.post<CompetitionGroup>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/groups`,
        payload,
      ),
    );
  }

  deleteGroup(organizationId: string, tournamentId: string, groupId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/groups/${groupId}`),
    );
  }

  getStandingRule(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<StandingRule> {
    return firstValueFrom(
      this.http.get<StandingRule>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/standing-rule`,
      ),
    );
  }

  updateStandingRule(
    organizationId: string,
    tournamentId: string,
    groupId: string,
    payload: UpdateStandingRulePayload,
  ): Promise<StandingRule> {
    return firstValueFrom(
      this.http.put<StandingRule>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/standing-rule`,
        payload,
      ),
    );
  }

  createKnockoutBracket(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    payload: CreateKnockoutBracketPayload,
  ): Promise<KnockoutBracket> {
    return firstValueFrom(
      this.http.post<KnockoutBracket>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/knockout-bracket`,
        payload,
      ),
    );
  }

  updateKnockoutBracket(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
    payload: UpdateKnockoutBracketPayload,
  ): Promise<KnockoutBracket> {
    return firstValueFrom(
      this.http.patch<KnockoutBracket>(
        `${this.base(organizationId, tournamentId)}/knockout-brackets/${bracketId}`,
        payload,
      ),
    );
  }

  deleteKnockoutBracket(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
  ): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId, tournamentId)}/knockout-brackets/${bracketId}`,
      ),
    );
  }

  generateBracketMatches(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
    payload: GenerateBracketMatchesPayload = {},
  ): Promise<Match[]> {
    return firstValueFrom(
      this.http.post<Match[]>(
        `${this.base(organizationId, tournamentId)}/knockout-brackets/${bracketId}/generate-matches`,
        payload,
      ),
    );
  }

  generateAllBracketMatches(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    payload: GenerateAllBracketMatchesPayload,
  ): Promise<Match[]> {
    return firstValueFrom(
      this.http.post<Match[]>(
        `${this.base(organizationId, tournamentId)}/categories/${categoryId}/knockout-phases/generate-matches`,
        payload,
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

  listQualificationRules(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<QualificationRule[]> {
    return firstValueFrom(
      this.http.get<QualificationRule[]>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/qualification-rules`,
      ),
    );
  }

  createQualificationRule(
    organizationId: string,
    tournamentId: string,
    groupId: string,
    payload: CreateQualificationRulePayload,
  ): Promise<QualificationRule> {
    return firstValueFrom(
      this.http.post<QualificationRule>(
        `${this.base(organizationId, tournamentId)}/groups/${groupId}/qualification-rules`,
        payload,
      ),
    );
  }

  deleteQualificationRule(
    organizationId: string,
    tournamentId: string,
    ruleId: string,
  ): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId, tournamentId)}/qualification-rules/${ruleId}`,
      ),
    );
  }

  listCrossGroupQualificationRules(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
  ): Promise<CrossGroupQualificationRule[]> {
    return firstValueFrom(
      this.http.get<CrossGroupQualificationRule[]>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/cross-group-qualification-rules`,
      ),
    );
  }

  createCrossGroupQualificationRule(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    payload: CreateCrossGroupQualificationRulePayload,
  ): Promise<CrossGroupQualificationRule> {
    return firstValueFrom(
      this.http.post<CrossGroupQualificationRule>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/cross-group-qualification-rules`,
        payload,
      ),
    );
  }

  deleteCrossGroupQualificationRule(
    organizationId: string,
    tournamentId: string,
    ruleId: string,
  ): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId, tournamentId)}/cross-group-qualification-rules/${ruleId}`,
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

  createStructurePreset(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    payload: CreateStructurePresetPayload,
  ): Promise<StructurePresetResult> {
    return firstValueFrom(
      this.http.post<StructurePresetResult>(
        `${this.base(organizationId, tournamentId)}/categories/${categoryId}/structure-presets`,
        payload,
      ),
    );
  }
}
