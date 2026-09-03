import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

// iOS-only In-App Purchase price catalogue (App Review guideline 3.1.1 --
// see docs/architecture/adr/0008-ios-distribution.md's "Bouton de
// suppression de compte" section and the 2026-08-29 rebrand for the wider
// App Review context this responds to). Each tournament-publication tier
// price (TournamentsService.tierPriceCents) needs a matching fixed-price
// StoreKit product, unlike Stripe Checkout's arbitrary-amount session --
// Apple has no notion of "charge this exact computed cents amount". The
// upgrade product exists because IAP also has no notion of "credit what
// was already paid toward a cheaper tier" (TournamentsService.publish's
// own delta-billing logic, `amountCents = requiredCents - alreadyPaidCents`) --
// a STANDARD->LARGE upgrade on iOS is its own separate product priced at
// exactly that gap, rather than re-charging LARGE's full price.
export const IAP_PRODUCT_IDS = {
  TOURNAMENT_PUBLICATION_STANDARD: 'tournament_publication_standard',
  TOURNAMENT_PUBLICATION_LARGE: 'tournament_publication_large',
  TOURNAMENT_PUBLICATION_UPGRADE_STANDARD_TO_LARGE:
    'tournament_publication_upgrade_standard_to_large',
  ANNUAL_SUBSCRIPTION: 'annual_subscription',
} as const;

export type IapProductId =
  (typeof IAP_PRODUCT_IDS)[keyof typeof IAP_PRODUCT_IDS];

export interface RevenueCatNonSubscriptionEntry {
  id: string; // RevenueCat's own transaction id for this specific purchase
  purchase_date: string;
  store: string;
  is_sandbox: boolean;
}

export interface RevenueCatSubscriptionEntry {
  expires_date: string | null;
  purchase_date: string;
  store: string;
  store_transaction_id: string;
  is_sandbox: boolean;
  unsubscribe_detected_at: string | null;
  refunded_at: string | null;
}

export interface RevenueCatSubscriber {
  original_app_user_id: string;
  non_subscriptions: Record<string, RevenueCatNonSubscriptionEntry[]>;
  subscriptions: Record<string, RevenueCatSubscriptionEntry>;
}

export interface RevenueCatWebhookEvent {
  api_version: string;
  event: {
    type: string;
    app_user_id: string;
    product_id: string;
    transaction_id: string;
    original_transaction_id: string;
    purchased_at_ms: number;
    expiration_at_ms: number | null;
    environment: 'SANDBOX' | 'PRODUCTION';
  };
}

/**
 * Thin wrapper around RevenueCat (the IAP receipt-validation/entitlement
 * layer this app uses instead of talking to Apple's own App Store Server
 * API directly -- see the conversation this was decided in: this app has no
 * way to test a real purchase itself, no physical device, no App Store
 * Connect access, so leaning on RevenueCat's already-battle-tested receipt
 * validation is materially lower-risk than a from-scratch StoreKit receipt
 * parser this app could never actually exercise end-to-end). Same lazy,
 * boot-without-crashing posture as StripeService: most of the app --
 * including every e2e spec that never touches iOS payments -- boots fine
 * without REVENUECAT_SECRET_API_KEY/REVENUECAT_WEBHOOK_SECRET set at all.
 */
@Injectable()
export class RevenueCatService {
  private static readonly API_BASE = 'https://api.revenuecat.com/v1';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Verifies RevenueCat's webhook delivery via a shared bearer token in the
   * `Authorization` header -- RevenueCat's dashboard offers this as the
   * webhook's own "Authorization header value" field (a plain shared
   * secret RevenueCat echoes back verbatim on every delivery, not a
   * per-request HMAC signature), which is the only authentication option
   * this account's RevenueCat plan exposed when the integration was set up
   * (2026-09). Constant-time comparison against
   * REVENUECAT_WEBHOOK_AUTH_TOKEN (the exact string configured on
   * RevenueCat's side, "Bearer <token>" included) -- same "trust the
   * payload once auth checks out" model as StripeService's signature
   * check, just a simpler shared-secret mechanism instead of HMAC. Throws
   * if the header is missing or doesn't match; the caller
   * (PaymentsWebhookController) turns that into a 400.
   */
  parseWebhookEvent(
    payload: Buffer,
    authorizationHeader: string,
  ): RevenueCatWebhookEvent {
    const expectedToken = this.configService.getOrThrow<string>(
      'REVENUECAT_WEBHOOK_AUTH_TOKEN',
    );
    const provided = Buffer.from(authorizationHeader ?? '', 'utf8');
    const expected = Buffer.from(expectedToken, 'utf8');
    // timingSafeEqual throws on length mismatch rather than returning false
    // -- an attacker-controlled provided length must never short-circuit
    // this into an exception path that behaves differently from "invalid".
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new Error('Invalid RevenueCat webhook Authorization header.');
    }
    return JSON.parse(payload.toString('utf8')) as RevenueCatWebhookEvent;
  }

  /**
   * Independent server-side verification for the app's own "I just
   * finished a StoreKit purchase, confirm it" call (mirrors
   * StripeService.retrieveCheckoutSession's role alongside the webhook --
   * a synchronous confirm path that doesn't solely depend on the webhook
   * having already landed, plus never trusting a client-reported
   * transaction id without checking it against RevenueCat's own records).
   * appUserId is this app's own User.id (see RevenueCatService's module
   * comment on why no separate RevenueCat-specific identifier is needed).
   */
  async fetchSubscriber(appUserId: string): Promise<RevenueCatSubscriber> {
    const apiKey = this.configService.getOrThrow<string>(
      'REVENUECAT_SECRET_API_KEY',
    );
    const res = await fetch(
      `${RevenueCatService.API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!res.ok) {
      throw new Error(`RevenueCat subscriber lookup failed: ${res.status}`);
    }
    const body = (await res.json()) as { subscriber: RevenueCatSubscriber };
    return body.subscriber;
  }
}
