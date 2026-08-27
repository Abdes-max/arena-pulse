import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export interface CreateCheckoutSessionParams {
  amountCents: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  // Shows Stripe's own "Add promotion code" field on the hosted checkout
  // page when true. The coupon and its customer-facing code (e.g. an
  // "offre de lancement" percentage off) are created directly in the
  // Stripe Dashboard -- Product catalog > Coupons, then > Promotion codes
  // -- not modeled in this app at all: Stripe already handles validation,
  // expiry and redemption limits, so there's nothing for our own DB to
  // track. Left off (undefined/false) by default so existing callers keep
  // today's behavior unchanged.
  allowPromotionCodes?: boolean;
}

/**
 * Thin wrapper around the Stripe SDK. The client is created lazily (not in
 * the constructor) so that most of the app -- including every e2e spec that
 * never touches payments -- can boot without STRIPE_SECRET_KEY set at all;
 * only the two methods below require it. Tests that do exercise a
 * registration/payment flow override this whole service with a stub
 * (see registrations.e2e-spec.ts) rather than hitting the real Stripe API.
 */
@Injectable()
export class StripeService {
  private client: Stripe | undefined;

  constructor(private readonly configService: ConfigService) {}

  createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<Stripe.Checkout.Session> {
    return this.getClient().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: params.currency,
            unit_amount: params.amountCents,
            product_data: { name: params.productName },
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
      allow_promotion_codes: params.allowPromotionCodes,
    });
  }

  /**
   * Lets a payment flow's own "success" page (session_id is already on that
   * URL, see createCheckoutSession's successUrl callers) confirm payment
   * directly against Stripe's API, instead of only ever finding out once
   * (if) a webhook delivery lands. Genuinely asynchronous either way, and
   * idempotent alongside the webhook -- just no longer *solely* dependent
   * on it, which is unreachable at all in local dev (no public URL for
   * Stripe to call back to) and can occasionally be delayed or dropped even
   * in production (Stripe's own docs recommend this exact reconciliation
   * pattern as a webhook complement, not a replacement).
   */
  retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.getClient().checkout.sessions.retrieve(sessionId);
  }

  /**
   * Stripe's own hosted receipt URL for the Charge underlying a
   * PaymentIntent (Charge.receipt_url) -- used to link the admin UI and the
   * payment confirmation email straight to Stripe's real receipt instead of
   * rendering a custom one (see TournamentsService.applyPaidPublicationSession).
   * Returns null rather than throwing if the charge isn't there yet or has
   * no receipt (e.g. receipt emails disabled on the Stripe account) --
   * never worth failing the whole "mark paid" transaction over.
   */
  async retrieveChargeReceiptUrl(
    paymentIntentId: string,
  ): Promise<string | null> {
    const paymentIntent = await this.getClient().paymentIntents.retrieve(
      paymentIntentId,
      { expand: ['latest_charge'] },
    );
    const charge = paymentIntent.latest_charge;
    if (!charge || typeof charge === 'string') {
      return null;
    }
    return charge.receipt_url ?? null;
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    return this.getClient().webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }

  private getClient(): Stripe {
    if (!this.client) {
      this.client = new Stripe(
        this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      );
    }
    return this.client;
  }
}
