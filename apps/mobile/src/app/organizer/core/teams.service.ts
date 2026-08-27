import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OrganizerTeam } from './models';

// Mirrors the relevant subset of apps/web/src/app/admin/core/teams.service.ts
// -- see models.ts's comment. Organizer-created teams don't need a player
// registration flow (apps/api/src/tournaments/teams.controller.ts's POST is
// a direct create), matching the wizard's "Équipes" step.
@Injectable({ providedIn: 'root' })
export class OrganizerTeamsService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}/teams`;
  }

  /** Edit-mode wizard's preload (tournament-wizard.page.ts) -- categoryId scopes to the wizard's one implicit category, same query param apps/web's own team-list.page.ts uses. */
  listTeams(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
  ): Promise<OrganizerTeam[]> {
    return firstValueFrom(
      this.http.get<OrganizerTeam[]>(this.base(organizationId, tournamentId), {
        params: { categoryId },
      }),
    );
  }

  createTeam(
    organizationId: string,
    tournamentId: string,
    payload: { name: string; categoryId: string },
  ): Promise<OrganizerTeam> {
    return firstValueFrom(
      this.http.post<OrganizerTeam>(this.base(organizationId, tournamentId), payload),
    );
  }

  removeTeam(organizationId: string, tournamentId: string, teamId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/${teamId}`),
    );
  }
}
