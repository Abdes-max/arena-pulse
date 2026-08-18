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
  sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountCreatedEmail: jest.fn().mockResolvedValue(undefined),
  sendSubscriptionReceiptEmail: jest.fn().mockResolvedValue(undefined),
};

async function registerOrganizer(app: INestApplication<App>) {
  const email = 'organizer@example.com';
  const password = 'a-very-strong-password';
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: 'Ada Tournaments',
    })
    .expect(201);
  // register() no longer issues a session -- mark the test account verified
  // directly in DB (bypassing the email link) and log in for real tokens,
  // mirroring what a real user does after clicking the verification link.
  await app
    .get(PrismaService)
    .user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const { accessToken } = loginRes.body as AuthResponseBody;
  const meRes = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  const { organizations } = meRes.body as { organizations: { id: string }[] };
  return { accessToken, organizationId: organizations[0].id };
}

describe('Organization annual subscription (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    stripeService.createCheckoutSession.mockClear();
    mailService.sendEmailVerificationEmail.mockClear();
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
      'fr',
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

  it('lists the full subscription history for the organization, most recent first, and rejects another organization from reading it', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const subscriptionUrl = `/api/v1/organizations/${organizationId}/subscription`;
    const historyUrl = `${subscriptionUrl}/history`;

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

    const historyRes = await auth(
      request(app.getHttpServer()).get(historyUrl),
    ).expect(200);
    const history = historyRes.body as {
      status: string;
      amountCents: number;
      currency: string;
    }[];
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      status: 'ACTIVE',
      amountCents: 20000,
      currency: 'eur',
    });

    // A member of a different organization must not read this one's history.
    const otherEmail = 'other-organizer@example.com';
    const otherPassword = 'a-very-strong-password';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: otherEmail,
        password: otherPassword,
        firstName: 'Bo',
        lastName: 'Belote',
        organizationName: 'Other Org',
      })
      .expect(201);
    await prisma.user.update({
      where: { email: otherEmail },
      data: { emailVerifiedAt: new Date() },
    });
    const otherLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: otherEmail, password: otherPassword })
      .expect(200);
    const otherAccessToken = (otherLoginRes.body as AuthResponseBody)
      .accessToken;

    await request(app.getHttpServer())
      .get(historyUrl)
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .expect(403);
  });
});
