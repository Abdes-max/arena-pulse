import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

// Mirrors the relevant subset of
// apps/web/src/app/admin/core/organizations.service.ts (see
// models.ts's comment) -- just enough for the wizard's "Plan" block
// (Publication step) to show the organization's current subscription
// status. Full management (payment history, receipts) still has no native
// mobile UI -- "Gérer mon abonnement" opens the web app's own page in the
// system browser instead, same pattern already used for the
// tournament-publication Stripe checkout itself (see
// tournament-wizard.page.ts's submitPublish()). Subscribing itself, on
// iOS, is the one exception -- see confirmSubscriptionPaymentViaIap below.
export interface OrganizationSubscriptionNone {
  status: 'NONE';
}

export interface OrganizationSubscriptionPending {
  status: 'PENDING_PAYMENT';
  amountCents: number;
  currency: string;
}

export interface OrganizationSubscriptionActive {
  status: 'ACTIVE';
  startsAt: string;
  expiresAt: string;
}

export type OrganizationSubscriptionStatus =
  OrganizationSubscriptionNone | OrganizationSubscriptionPending | OrganizationSubscriptionActive;

@Injectable({ providedIn: 'root' })
export class OrganizerOrganizationsService {
  private readonly http = inject(HttpClient);

  getSubscriptionStatus(organizationId: string): Promise<OrganizationSubscriptionStatus> {
    return firstValueFrom(
      this.http.get<OrganizationSubscriptionStatus>(
        `${environment.apiUrl}/organizations/${organizationId}/subscription`,
      ),
    );
  }

  /**
   * iOS counterpart of the web app's Stripe-based subscribe() -- called
   * once IapService.purchase('annual_subscription') reports StoreKit
   * success. No pending order to create first here (unlike
   * TournamentsService.publish()'s PENDING_PAYMENT/iapProductId pair):
   * the backend's confirm-iap endpoint looks the purchase up directly
   * against RevenueCat's own subscriber record for this user, same "never
   * trust the client" posture as every other IAP confirmation in this app.
   */
  confirmSubscriptionPaymentViaIap(
    organizationId: string,
  ): Promise<OrganizationSubscriptionStatus> {
    return firstValueFrom(
      this.http.post<OrganizationSubscriptionStatus>(
        `${environment.apiUrl}/organizations/${organizationId}/subscription/confirm-iap`,
        {},
      ),
    );
  }
}
