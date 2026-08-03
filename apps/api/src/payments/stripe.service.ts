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
    });
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
