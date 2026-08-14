import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type Stripe from 'stripe';
import { App } from 'supertest/types';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StripeService } from '../src/payments/stripe.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

interface SubscribeResponseBody {
  status?: 'PENDING_PAYMENT' | 'ACTIVE';
  checkoutUrl?: string;
  expiresAt?: string;
}

// A stubbed StripeService -- no e2e spec talks to the real Stripe API. See
// docs/architecture/adr/0006-paid-tournament-publication.md.
const stripeService = {
  createCheckoutSession: jest.fn().mockResolvedValue({
    id: 'cs_test_subscription_123',
    url: 'https://checkout.stripe.example/cs_test_subscription_123',
  }),
  constructWebhookEvent: jest.fn(
    (payload: Buffer) => JSON.parse(payload.toString()) as Stripe.Event,
  ),
};

const mailService = {
  sendAccountCreatedEmail: jest.fn().mockResolvedValue(undefined),
  sendSubscriptionReceiptEmail: jest.fn().mockResolvedValue(undefined),
};

async function registerOrganizer(app: INestApplication<App>) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email: 'organizer@example.com',
      password: 'a-very-strong-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: 'Ada Tournaments',
    })
    .expect(201);
  const body = res.body as AuthResponseBody;
  return {
    accessToken: body.accessToken,
    organizationId: body.organization!.id,
  };
}

describe('Organization annual subscription (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    stripeService.createCheckoutSession.mockClear();
    mailService.sendAccountCreatedEmail.mockClear();
    mailService.sendSubscriptionReceiptEmail.mockClear();
    // ConfigService reads process.env at module init -- set before
    // createTestApp() so OrganizationsService picks up a non-zero price
    // instead of the 0-cents default used by every other e2e spec.
    process.env['ORGANIZATION_ANNUAL_SUBSCRIPTION_PRICE_CENTS'] = '20000';
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(StripeService)
        .useValue(stripeService)
        .overrideProvider(MailService)
        .useValue(mailService),
    );
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    delete process.env['ORGANIZATION_ANNUAL_SUBSCRIPTION_PRICE_CENTS'];
    await resetDatabase(prisma);
    await app.close();
  });

  it('requires payment to subscribe, activates on webhook confirmation and emails every org admin a receipt', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const subscriptionUrl = `/api/v1/organizations/${organizationId}/subscription`;

    const noneRes = await auth(
      request(app.getHttpServer()).get(subscriptionUrl),
    ).expect(200);
    expect((noneRes.body as { status: string }).status).toBe('NONE');

    const subscribeRes = await auth(
      request(app.getHttpServer()).post(subscriptionUrl),
    ).expect(201);
    const subscribeBody = subscribeRes.body as SubscribeResponseBody;
    expect(subscribeBody.status).toBe('PENDING_PAYMENT');
    expect(subscribeBody.checkoutUrl).toBe(
      'https://checkout.stripe.example/cs_test_subscription_123',
    );
    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 20000, currency: 'eur' }),
    );

    const pendingRes = await auth(
      request(app.getHttpServer()).get(subscriptionUrl),
    ).expect(200);
    expect((pendingRes.body as { status: string }).status).toBe(
      'PENDING_PAYMENT',
    );

    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'test-signature')
      .send({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_subscription_123',
            payment_intent: 'pi_test_sub_1',
          },
        },
      })
      .expect(200, { received: true });

    const activeRes = await auth(
      request(app.getHttpServer()).get(subscriptionUrl),
    ).expect(200);
    expect((activeRes.body as { status: string }).status).toBe('ACTIVE');

    expect(mailService.sendSubscriptionReceiptEmail).toHaveBeenCalledTimes(1);
    expect(mailService.sendSubscriptionReceiptEmail).toHaveBeenCalledWith(
      'organizer@example.com',
      'Ada Tournaments',
      20000,
      'eur',
      expect.any(Date),
    );
  });

  it('rejects a second subscription while one is already active', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const subscriptionUrl = `/api/v1/organizations/${organizationId}/subscription`;

    await auth(request(app.getHttpServer()).post(subscriptionUrl)).expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'test-signature')
      .send({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_subscription_123',
            payment_intent: 'pi_test_sub_1',
          },
        },
      })
      .expect(200, { received: true });

    await auth(request(app.getHttpServer()).post(subscriptionUrl)).expect(409);
  });
});
