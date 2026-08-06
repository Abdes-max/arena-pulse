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

export interface GenerateBracketMatchesPayload {
  // Round 1 only -- omit to leave it unscheduled (placed later by hand on
  // the Calendrier page's drag-and-drop editor), same as before this existed.
  fieldIds?: string[];
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

export interface StructurePresetTierPayload {
  name: string;
  qualifiersPerPool: number;
}

export interface StructurePresetBestOfPositionPayload {
  position: number;
  bestCount: number;
}

export interface CreateStructurePresetPayload {
  teamCount: number;
  poolCount: number;
  tiers: StructurePresetTierPayload[];
  bestOfPosition?: StructurePresetBestOfPositionPayload;
  fieldIds: string[];
  startDateTime: string;
  matchDurationMinutes?: number;
  breakDurationMinutes?: number;
  refereesPerMatch?: number;
  doubleRoundRobin?: boolean;
  knockoutFieldIds: string[];
  knockoutStartDateTime: string;
  knockoutMatchDurationMinutes?: number;
  knockoutBreakDurationMinutes?: number;
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
