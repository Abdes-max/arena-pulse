import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OrganizerRegistration } from 'shared-models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RegistrationsService {
  private readonly http = inject(HttpClient);

  listRegistrations(
    organizationId: string,
    tournamentId: string,
  ): Promise<OrganizerRegistration[]> {
    return firstValueFrom(
      this.http.get<OrganizerRegistration[]>(
        `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}/registrations`,
      ),
    );
  }
}
