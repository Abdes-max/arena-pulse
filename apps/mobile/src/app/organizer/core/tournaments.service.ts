import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateTournamentPayload,
  OrganizerTournament,
  PremiumFeaturesStatus,
  PublicTheme,
  PublishTournamentResult,
} from './models';

// Mirrors the relevant subset of
// apps/web/src/app/admin/core/tournaments.service.ts (see models.ts's
// comment on why this is a deliberate port, not a shared lib) -- against the
// same /organizations/:id/tournaments/* endpoints. Only what the creation
// wizard + "Mes tournois" list actually use: the richer surface (venues,
// fields, sponsors, referees, publication orders...) stays admin-web-only
// for now, out of this wizard's scope.
@Injectable({ providedIn: 'root' })
export class OrganizerTournamentsService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments`;
  }

  listTournaments(organizationId: string): Promise<OrganizerTournament[]> {
    return firstValueFrom(this.http.get<OrganizerTournament[]>(this.base(organizationId)));
  }

  createTournament(
    organizationId: string,
    payload: CreateTournamentPayload,
  ): Promise<OrganizerTournament> {
    return firstValueFrom(this.http.post<OrganizerTournament>(this.base(organizationId), payload));
  }

  uploadLogo(
    organizationId: string,
    tournamentId: string,
    file: File,
  ): Promise<OrganizerTournament> {
    const formData = new FormData();
    formData.append('logo', file);
    return firstValueFrom(
      this.http.post<OrganizerTournament>(
        `${this.base(organizationId)}/${tournamentId}/logo`,
        formData,
      ),
    );
  }

  getPremiumFeatures(organizationId: string, tournamentId: string): Promise<PremiumFeaturesStatus> {
    return firstValueFrom(
      this.http.get<PremiumFeaturesStatus>(
        `${this.base(organizationId)}/${tournamentId}/premium-features`,
      ),
    );
  }

  updateTournament(
    organizationId: string,
    tournamentId: string,
    payload: { isListed?: boolean; theme?: PublicTheme },
  ): Promise<OrganizerTournament> {
    return firstValueFrom(
      this.http.patch<OrganizerTournament>(`${this.base(organizationId)}/${tournamentId}`, payload),
    );
  }

  publish(organizationId: string, tournamentId: string): Promise<PublishTournamentResult> {
    return firstValueFrom(
      this.http.post<PublishTournamentResult>(
        `${this.base(organizationId)}/${tournamentId}/publish`,
        {},
      ),
    );
  }

  /** See apps/web's own confirmPublicationPayment: safe to call unconditionally, always returns the tournament's current state. */
  confirmPublicationPayment(
    organizationId: string,
    tournamentId: string,
    sessionId: string,
  ): Promise<OrganizerTournament> {
    return firstValueFrom(
      this.http.post<OrganizerTournament>(
        `${this.base(organizationId)}/${tournamentId}/publish/confirm`,
        { sessionId },
      ),
    );
  }
}
