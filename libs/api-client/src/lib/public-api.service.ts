import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Category,
  CompetitionPhase,
  CreateRegistrationPayload,
  CreateRegistrationResult,
  Match,
  PlayerRegistration,
  PublicTeam,
  PublicTeamDetail,
  PublicTournament,
  PublicTournamentSummary,
  Qualification,
  Standings,
} from 'shared-models';
import { API_CLIENT_CONFIG } from './api-client.config';

@Injectable({ providedIn: 'root' })
export class PublicApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CLIENT_CONFIG);

  private base(slug: string): string {
    return `${this.config.apiUrl}/public/tournaments/${slug}`;
  }

  listTournaments(limit?: number): Promise<PublicTournamentSummary[]> {
    return firstValueFrom(
      this.http.get<PublicTournamentSummary[]>(`${this.config.apiUrl}/public/tournaments`, {
        params: limit !== undefined ? new HttpParams().set('limit', limit) : undefined,
      }),
    );
  }

  getTournament(slug: string): Promise<PublicTournament> {
    return firstValueFrom(this.http.get<PublicTournament>(this.base(slug)));
  }

  listCategories(slug: string): Promise<Category[]> {
    return firstValueFrom(this.http.get<Category[]>(`${this.base(slug)}/categories`));
  }

  listPhases(slug: string, categoryId: string): Promise<CompetitionPhase[]> {
    return firstValueFrom(
      this.http.get<CompetitionPhase[]>(`${this.base(slug)}/categories/${categoryId}/phases`),
    );
  }

  listTeams(slug: string, categoryId?: string): Promise<PublicTeam[]> {
    const params = categoryId ? new HttpParams().set('categoryId', categoryId) : undefined;
    return firstValueFrom(this.http.get<PublicTeam[]>(`${this.base(slug)}/teams`, { params }));
  }

  getTeam(slug: string, teamId: string): Promise<PublicTeamDetail> {
    return firstValueFrom(this.http.get<PublicTeamDetail>(`${this.base(slug)}/teams/${teamId}`));
  }

  getStandings(slug: string, groupId: string): Promise<Standings> {
    return firstValueFrom(
      this.http.get<Standings>(`${this.base(slug)}/groups/${groupId}/standings`),
    );
  }

  getQualifications(slug: string, groupId: string): Promise<Qualification[]> {
    return firstValueFrom(
      this.http.get<Qualification[]>(`${this.base(slug)}/groups/${groupId}/qualifications`),
    );
  }

  listPhaseMatches(slug: string, phaseId: string): Promise<Match[]> {
    return firstValueFrom(this.http.get<Match[]>(`${this.base(slug)}/phases/${phaseId}/matches`));
  }

  listBracketMatches(slug: string, bracketId: string): Promise<Match[]> {
    return firstValueFrom(
      this.http.get<Match[]>(`${this.base(slug)}/knockout-brackets/${bracketId}/matches`),
    );
  }

  listUpcomingMatches(slug: string, limit?: number): Promise<Match[]> {
    return firstValueFrom(
      this.http.get<Match[]>(`${this.base(slug)}/matches/upcoming`, {
        params: limit !== undefined ? new HttpParams().set('limit', limit) : undefined,
      }),
    );
  }

  createRegistration(
    slug: string,
    categoryId: string,
    payload: CreateRegistrationPayload,
  ): Promise<CreateRegistrationResult> {
    return firstValueFrom(
      this.http.post<CreateRegistrationResult>(
        `${this.base(slug)}/categories/${categoryId}/registrations`,
        payload,
      ),
    );
  }

  listMyRegistrations(): Promise<PlayerRegistration[]> {
    return firstValueFrom(
      this.http.get<PlayerRegistration[]>(`${this.config.apiUrl}/public/registrations/me`),
    );
  }
}
