import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Category,
  CompetitionPhase,
  ContactMessagePayload,
  CreateRegistrationPayload,
  CreateRegistrationResult,
  Match,
  PlayerRegistration,
  PublicSport,
  PublicTeam,
  PublicTeamDetail,
  PublicTournament,
  PublicTournamentSearchQuery,
  PublicTournamentSearchResult,
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

  listSports(): Promise<PublicSport[]> {
    return firstValueFrom(this.http.get<PublicSport[]>(`${this.config.apiUrl}/sports`));
  }

  listTournaments(limit?: number): Promise<PublicTournamentSummary[]> {
    return firstValueFrom(
      this.http.get<PublicTournamentSummary[]>(`${this.config.apiUrl}/public/tournaments`, {
        params: limit !== undefined ? new HttpParams().set('limit', limit) : undefined,
      }),
    );
  }

  searchTournaments(query: PublicTournamentSearchQuery): Promise<PublicTournamentSearchResult> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.q) params = params.set('q', query.q);
    if (query.sportId) params = params.set('sportId', query.sportId);
    if (query.location) params = params.set('location', query.location);
    if (query.dateFrom) params = params.set('dateFrom', query.dateFrom);
    return firstValueFrom(
      this.http.get<PublicTournamentSearchResult>(
        `${this.config.apiUrl}/public/tournaments/search`,
        {
          params,
        },
      ),
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

  /**
   * Called from the "register success" page (session_id is already on its
   * URL, since Stripe appends it to the checkoutUrl's successUrl) --
   * verifies the payment directly against Stripe instead of only ever
   * polling the player's registrations and hoping the webhook already
   * landed. Returns the same shape as listMyRegistrations (the now
   * up-to-date list), safe to call unconditionally.
   */
  confirmRegistrationPayment(sessionId: string): Promise<PlayerRegistration[]> {
    return firstValueFrom(
      this.http.post<PlayerRegistration[]>(`${this.config.apiUrl}/public/registrations/confirm`, {
        sessionId,
      }),
    );
  }

  sendContactMessage(payload: ContactMessagePayload): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.config.apiUrl}/contact`, payload));
  }
}
