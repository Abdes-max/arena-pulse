import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Category,
  Division,
  Tournament,
  TournamentAdministrator,
  TournamentDetail,
  TournamentStatus,
} from './models';

export interface CreateTournamentPayload {
  name: string;
  sportId: string;
  startDate?: string;
  endDate?: string;
  isOnline?: boolean;
}

export interface UpdateTournamentPayload {
  name?: string;
  sportId?: string;
  startDate?: string | null;
  endDate?: string | null;
  isOnline?: boolean;
}

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

  publish(organizationId: string, tournamentId: string): Promise<TournamentDetail> {
    return firstValueFrom(
      this.http.post<TournamentDetail>(`${this.base(organizationId)}/${tournamentId}/publish`, {}),
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

  createCategory(organizationId: string, tournamentId: string, name: string): Promise<Category> {
    return firstValueFrom(
      this.http.post<Category>(`${this.base(organizationId)}/${tournamentId}/categories`, { name }),
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
