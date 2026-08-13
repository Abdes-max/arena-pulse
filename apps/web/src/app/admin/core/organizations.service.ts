import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OrganizationMember,
  OrganizationRole,
  OrganizationSubscriptionStatus,
  PendingInvitation,
  SubscribeResult,
} from './models';

@Injectable({ providedIn: 'root' })
export class OrganizationsService {
  private readonly http = inject(HttpClient);

  listMembers(organizationId: string): Promise<OrganizationMember[]> {
    return firstValueFrom(
      this.http.get<OrganizationMember[]>(
        `${environment.apiUrl}/organizations/${organizationId}/members`,
      ),
    );
  }

  changeRole(organizationId: string, memberId: string, role: OrganizationRole): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(
        `${environment.apiUrl}/organizations/${organizationId}/members/${memberId}`,
        {
          role,
        },
      ),
    );
  }

  removeMember(organizationId: string, memberId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${environment.apiUrl}/organizations/${organizationId}/members/${memberId}`,
      ),
    );
  }

  listPendingInvitations(organizationId: string): Promise<PendingInvitation[]> {
    return firstValueFrom(
      this.http.get<PendingInvitation[]>(
        `${environment.apiUrl}/organizations/${organizationId}/invitations`,
      ),
    );
  }

  invite(
    organizationId: string,
    email: string,
    role: OrganizationRole,
  ): Promise<PendingInvitation> {
    return firstValueFrom(
      this.http.post<PendingInvitation>(
        `${environment.apiUrl}/organizations/${organizationId}/invitations`,
        {
          email,
          role,
        },
      ),
    );
  }

  revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${environment.apiUrl}/organizations/${organizationId}/invitations/${invitationId}`,
      ),
    );
  }

  getSubscriptionStatus(organizationId: string): Promise<OrganizationSubscriptionStatus> {
    return firstValueFrom(
      this.http.get<OrganizationSubscriptionStatus>(
        `${environment.apiUrl}/organizations/${organizationId}/subscription`,
      ),
    );
  }

  subscribe(organizationId: string): Promise<SubscribeResult> {
    return firstValueFrom(
      this.http.post<SubscribeResult>(
        `${environment.apiUrl}/organizations/${organizationId}/subscription`,
        {},
      ),
    );
  }
}
