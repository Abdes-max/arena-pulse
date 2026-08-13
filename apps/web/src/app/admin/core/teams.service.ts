import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Player, Team, TeamImportResult } from './models';

export interface CreateTeamPayload {
  name: string;
  categoryId: string;
  divisionId?: string;
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
}

export interface UpdateTeamPayload {
  name?: string;
  categoryId?: string;
  divisionId?: string;
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
}

export interface CreatePlayerPayload {
  firstName: string;
  lastName: string;
  jerseyNumber?: number;
  isCaptain?: boolean;
}

export interface UpdatePlayerPayload {
  firstName?: string;
  lastName?: string;
  jerseyNumber?: number;
  isCaptain?: boolean;
}

@Injectable({ providedIn: 'root' })
export class TeamsService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}/teams`;
  }

  listTeams(organizationId: string, tournamentId: string, categoryId?: string): Promise<Team[]> {
    const url = categoryId
      ? `${this.base(organizationId, tournamentId)}?categoryId=${categoryId}`
      : this.base(organizationId, tournamentId);
    return firstValueFrom(this.http.get<Team[]>(url));
  }

  createTeam(
    organizationId: string,
    tournamentId: string,
    payload: CreateTeamPayload,
  ): Promise<Team> {
    return firstValueFrom(this.http.post<Team>(this.base(organizationId, tournamentId), payload));
  }

  updateTeam(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    payload: UpdateTeamPayload,
  ): Promise<Team> {
    return firstValueFrom(
      this.http.patch<Team>(`${this.base(organizationId, tournamentId)}/${teamId}`, payload),
    );
  }

  deleteTeam(organizationId: string, tournamentId: string, teamId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/${teamId}`),
    );
  }

  uploadLogo(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    file: File,
  ): Promise<Team> {
    const formData = new FormData();
    formData.append('logo', file);
    return firstValueFrom(
      this.http.post<Team>(`${this.base(organizationId, tournamentId)}/${teamId}/logo`, formData),
    );
  }

  removeLogo(organizationId: string, tournamentId: string, teamId: string): Promise<Team> {
    return firstValueFrom(
      this.http.delete<Team>(`${this.base(organizationId, tournamentId)}/${teamId}/logo`),
    );
  }

  assignGroup(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    groupId: string | null,
  ): Promise<Team> {
    return firstValueFrom(
      this.http.patch<Team>(`${this.base(organizationId, tournamentId)}/${teamId}/group`, {
        groupId,
      }),
    );
  }

  bulkDeleteTeams(organizationId: string, tournamentId: string, teamIds: string[]): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base(organizationId, tournamentId)}/bulk-delete`, { teamIds }),
    );
  }

  importTeams(
    organizationId: string,
    tournamentId: string,
    csv: string,
  ): Promise<TeamImportResult> {
    return firstValueFrom(
      this.http.post<TeamImportResult>(`${this.base(organizationId, tournamentId)}/import`, {
        csv,
      }),
    );
  }

  exportTeams(organizationId: string, tournamentId: string): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.base(organizationId, tournamentId)}/export`, {
        responseType: 'text',
      }),
    );
  }

  listPlayers(organizationId: string, tournamentId: string, teamId: string): Promise<Player[]> {
    return firstValueFrom(
      this.http.get<Player[]>(`${this.base(organizationId, tournamentId)}/${teamId}/players`),
    );
  }

  addPlayer(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    payload: CreatePlayerPayload,
  ): Promise<Player> {
    return firstValueFrom(
      this.http.post<Player>(
        `${this.base(organizationId, tournamentId)}/${teamId}/players`,
        payload,
      ),
    );
  }

  updatePlayer(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    playerId: string,
    payload: UpdatePlayerPayload,
  ): Promise<Player> {
    return firstValueFrom(
      this.http.patch<Player>(
        `${this.base(organizationId, tournamentId)}/${teamId}/players/${playerId}`,
        payload,
      ),
    );
  }

  removePlayer(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    playerId: string,
  ): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId, tournamentId)}/${teamId}/players/${playerId}`,
      ),
    );
  }
}
