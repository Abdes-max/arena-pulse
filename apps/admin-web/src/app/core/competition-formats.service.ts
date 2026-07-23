import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CompetitionGroup,
  CompetitionPhase,
  CompetitionPhaseType,
  KnockoutBracket,
  QualificationRule,
  StandingRule,
} from './models';

export interface CreatePhasePayload {
  name: string;
  type: CompetitionPhaseType;
  position?: number;
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

export interface CreateQualificationRulePayload {
  fromPosition: number;
  toPosition: number;
  targetPhaseId: string;
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
}
