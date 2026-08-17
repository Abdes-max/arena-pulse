import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Category,
  Division,
  Field,
  PublicationOrder,
  PublicTheme,
  Tournament,
  TournamentAdministrator,
  TournamentDetail,
  TournamentStatus,
  Venue,
} from './models';

export interface CreateTournamentPayload {
  name: string;
  sportId: string;
  startDate?: string;
  endDate?: string;
  isOnline?: boolean;
  theme?: PublicTheme;
}

export interface UpdateTournamentPayload {
  name?: string;
  sportId?: string;
  startDate?: string | null;
  endDate?: string | null;
  isOnline?: boolean;
  teamsCanReferee?: boolean;
  theme?: PublicTheme;
  description?: string;
  rules?: string;
  practicalInfo?: string;
}

// Publishing may require a Stripe payment first (feat/039, tarif calculé sur
// le nombre de catégories/équipes) -- see
// docs/architecture/adr/0006-paid-tournament-publication.md. The tournament
// only actually reaches PUBLISHED once the webhook confirms the payment.
export interface PublishPendingPayment {
  status: 'PENDING_PAYMENT';
  checkoutUrl: string;
}

export type PublishTournamentResult = TournamentDetail | PublishPendingPayment;

@Injectable({ providedIn: 'root' })
export class TournamentsService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments`;
  }

  listTournaments(organizationId: string, status?: TournamentStatus): Promise<Tournament[]> {
    const url = status
      ? `${this.base(organizationId)}?status=${status}`
      : this.base(organizationId);
    return firstValueFrom(this.http.get<Tournament[]>(url));
  }

  getTournament(organizationId: string, tournamentId: string): Promise<TournamentDetail> {
    return firstValueFrom(
      this.http.get<TournamentDetail>(`${this.base(organizationId)}/${tournamentId}`),
    );
  }

  createTournament(
    organizationId: string,
    payload: CreateTournamentPayload,
  ): Promise<TournamentDetail> {
    return firstValueFrom(this.http.post<TournamentDetail>(this.base(organizationId), payload));
  }

  updateTournament(
    organizationId: string,
    tournamentId: string,
    payload: UpdateTournamentPayload,
  ): Promise<TournamentDetail> {
    return firstValueFrom(
      this.http.patch<TournamentDetail>(`${this.base(organizationId)}/${tournamentId}`, payload),
    );
  }

  uploadLogo(organizationId: string, tournamentId: string, file: File): Promise<TournamentDetail> {
    const formData = new FormData();
    formData.append('logo', file);
    return firstValueFrom(
      this.http.post<TournamentDetail>(
        `${this.base(organizationId)}/${tournamentId}/logo`,
        formData,
      ),
    );
  }

  removeLogo(organizationId: string, tournamentId: string): Promise<TournamentDetail> {
    return firstValueFrom(
      this.http.delete<TournamentDetail>(`${this.base(organizationId)}/${tournamentId}/logo`),
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

  /**
   * Called from the "publish success" page (session_id is already on its
   * URL, since Stripe appends it to the checkoutUrl's successUrl) --
   * verifies the payment directly against Stripe instead of only ever
   * polling the tournament and hoping the webhook already landed. Always
   * returns the tournament's current state, PUBLISHED or not -- never an
   * error, safe to call unconditionally.
   */
  confirmPublicationPayment(
    organizationId: string,
    tournamentId: string,
    sessionId: string,
  ): Promise<TournamentDetail> {
    return firstValueFrom(
      this.http.post<TournamentDetail>(
        `${this.base(organizationId)}/${tournamentId}/publish/confirm`,
        { sessionId },
      ),
    );
  }

  listPublicationOrders(organizationId: string, tournamentId: string): Promise<PublicationOrder[]> {
    return firstValueFrom(
      this.http.get<PublicationOrder[]>(
        `${this.base(organizationId)}/${tournamentId}/publication-orders`,
      ),
    );
  }

  unpublish(organizationId: string, tournamentId: string): Promise<TournamentDetail> {
    return firstValueFrom(
      this.http.post<TournamentDetail>(
        `${this.base(organizationId)}/${tournamentId}/unpublish`,
        {},
      ),
    );
  }

  archive(organizationId: string, tournamentId: string): Promise<TournamentDetail> {
    return firstValueFrom(
      this.http.post<TournamentDetail>(`${this.base(organizationId)}/${tournamentId}/archive`, {}),
    );
  }

  unarchive(organizationId: string, tournamentId: string): Promise<TournamentDetail> {
    return firstValueFrom(
      this.http.post<TournamentDetail>(
        `${this.base(organizationId)}/${tournamentId}/unarchive`,
        {},
      ),
    );
  }

  duplicate(
    organizationId: string,
    tournamentId: string,
    name?: string,
  ): Promise<TournamentDetail> {
    return firstValueFrom(
      this.http.post<TournamentDetail>(`${this.base(organizationId)}/${tournamentId}/duplicate`, {
        name,
      }),
    );
  }

  listCategories(organizationId: string, tournamentId: string): Promise<Category[]> {
    return firstValueFrom(
      this.http.get<Category[]>(`${this.base(organizationId)}/${tournamentId}/categories`),
    );
  }

  createCategory(
    organizationId: string,
    tournamentId: string,
    name: string,
    registrationFeeCents?: number,
    registrationFeeCurrency?: string,
  ): Promise<Category> {
    return firstValueFrom(
      this.http.post<Category>(`${this.base(organizationId)}/${tournamentId}/categories`, {
        name,
        registrationFeeCents,
        registrationFeeCurrency,
      }),
    );
  }

  updateCategoryFee(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    registrationFeeCents: number | null,
    registrationFeeCurrency?: string,
  ): Promise<Category> {
    return firstValueFrom(
      this.http.patch<Category>(
        `${this.base(organizationId)}/${tournamentId}/categories/${categoryId}`,
        { registrationFeeCents, registrationFeeCurrency },
      ),
    );
  }

  updateCategory(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    name: string,
  ): Promise<Category> {
    return firstValueFrom(
      this.http.patch<Category>(
        `${this.base(organizationId)}/${tournamentId}/categories/${categoryId}`,
        { name },
      ),
    );
  }

  deleteCategory(organizationId: string, tournamentId: string, categoryId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId)}/${tournamentId}/categories/${categoryId}`,
      ),
    );
  }

  createDivision(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    name: string,
    colorHex?: string,
  ): Promise<Division> {
    return firstValueFrom(
      this.http.post<Division>(
        `${this.base(organizationId)}/${tournamentId}/categories/${categoryId}/divisions`,
        { name, colorHex },
      ),
    );
  }

  deleteDivision(organizationId: string, tournamentId: string, divisionId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId)}/${tournamentId}/divisions/${divisionId}`,
      ),
    );
  }

  listVenues(organizationId: string, tournamentId: string): Promise<Venue[]> {
    return firstValueFrom(
      this.http.get<Venue[]>(`${this.base(organizationId)}/${tournamentId}/venues`),
    );
  }

  createVenue(
    organizationId: string,
    tournamentId: string,
    payload: { name: string; address?: string },
  ): Promise<Venue> {
    return firstValueFrom(
      this.http.post<Venue>(`${this.base(organizationId)}/${tournamentId}/venues`, payload),
    );
  }

  deleteVenue(organizationId: string, tournamentId: string, venueId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId)}/${tournamentId}/venues/${venueId}`),
    );
  }

  createField(
    organizationId: string,
    tournamentId: string,
    venueId: string,
    payload: { name: string; surface?: string },
  ): Promise<Field> {
    return firstValueFrom(
      this.http.post<Field>(
        `${this.base(organizationId)}/${tournamentId}/venues/${venueId}/fields`,
        payload,
      ),
    );
  }

  deleteField(organizationId: string, tournamentId: string, fieldId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId)}/${tournamentId}/fields/${fieldId}`),
    );
  }

  listAdministrators(
    organizationId: string,
    tournamentId: string,
  ): Promise<TournamentAdministrator[]> {
    return firstValueFrom(
      this.http.get<TournamentAdministrator[]>(
        `${this.base(organizationId)}/${tournamentId}/administrators`,
      ),
    );
  }

  addAdministrator(
    organizationId: string,
    tournamentId: string,
    email: string,
    permissionKeys: string[],
  ): Promise<TournamentAdministrator> {
    return firstValueFrom(
      this.http.post<TournamentAdministrator>(
        `${this.base(organizationId)}/${tournamentId}/administrators`,
        { email, permissionKeys },
      ),
    );
  }

  updateAdministratorPermissions(
    organizationId: string,
    tournamentId: string,
    administratorId: string,
    permissionKeys: string[],
  ): Promise<TournamentAdministrator> {
    return firstValueFrom(
      this.http.patch<TournamentAdministrator>(
        `${this.base(organizationId)}/${tournamentId}/administrators/${administratorId}`,
        { permissionKeys },
      ),
    );
  }

  removeAdministrator(
    organizationId: string,
    tournamentId: string,
    administratorId: string,
  ): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${this.base(organizationId)}/${tournamentId}/administrators/${administratorId}`,
      ),
    );
  }
}
