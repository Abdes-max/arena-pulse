import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { InvitationLookup } from './models';

export interface AcceptInvitationPayload {
  password?: string;
  firstName?: string;
  lastName?: string;
}

export interface AcceptInvitationResponse {
  organization: { id: string; name: string; role: string };
  accessToken?: string;
  expiresIn?: number;
}

@Injectable({ providedIn: 'root' })
export class InvitationsService {
  private readonly http = inject(HttpClient);

  lookup(token: string): Promise<InvitationLookup> {
    return firstValueFrom(this.http.get<InvitationLookup>(`${environment.apiUrl}/invitations/${token}`));
  }

  accept(token: string, payload: AcceptInvitationPayload): Promise<AcceptInvitationResponse> {
    return firstValueFrom(
      this.http.post<AcceptInvitationResponse>(`${environment.apiUrl}/invitations/${token}/accept`, payload, {
        withCredentials: true,
      }),
    );
  }
}
