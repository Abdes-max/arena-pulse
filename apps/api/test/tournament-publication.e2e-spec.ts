import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type Stripe from 'stripe';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { StripeService } from '../src/payments/stripe.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

interface PublishResponseBody {
  status?: 'PENDING_PAYMENT';
  checkoutUrl?: string;
  id?: string;
}

interface TournamentResponseBody {
  id: string;
  status: string;
}

// A stubbed StripeService -- no e2e spec talks to the real Stripe API. See
// docs/architecture/adr/0005-player-registration-and-payments.md and
// docs/architecture/adr/0006-paid-tournament-publication.md.
const stripeService = {
  createCheckoutSession: jest.fn().mockResolvedValue({
    id: 'cs_test_publish_123',
    url: 'https://checkout.stripe.example/cs_test_publish_123',
  }),
  constructWebhookEvent: jest.fn(
    (payload: Buffer) => JSON.parse(payload.toString()) as Stripe.Event,
  ),
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

describe('Paid tournament publication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    stripeService.createCheckoutSession.mockClear();
    // ConfigService reads process.env at module init -- set before
    // createTestApp() so TournamentsService picks up a non-zero fee instead
    // of the 0-cents default used by every other e2e spec. Free tier max of
    // 0 teams means even a single team lands in the paid mid tier.
    process.env['TOURNAMENT_PUBLICATION_TIER_FREE_MAX_TEAMS'] = '0';
    process.env['TOURNAMENT_PUBLICATION_TIER_MID_MAX_TEAMS'] = '100';
    process.env['TOURNAMENT_PUBLICATION_TIER_MID_PRICE_CENTS'] = '1000';
    process.env['ORGANIZATION_ANNUAL_SUBSCRIPTION_PRICE_CENTS'] = '20000';
    app = await createTestApp((builder) =>
      builder.overrideProvider(StripeService).useValue(stripeService),
    );
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    delete process.env['TOURNAMENT_PUBLICATION_TIER_FREE_MAX_TEAMS'];
    delete process.env['TOURNAMENT_PUBLICATION_TIER_MID_MAX_TEAMS'];
    delete process.env['TOURNAMENT_PUBLICATION_TIER_MID_PRICE_CENTS'];
    delete process.env['ORGANIZATION_ANNUAL_SUBSCRIPTION_PRICE_CENTS'];
    await resetDatabase(prisma);
    await app.close();
  });

  it('requires payment to publish a tournament with a team in the paid tier, and only publishes once the webhook confirms it', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe Payante', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'Senior' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
    )
      .send({
        name: 'Lions',
        categoryId,
        managerEmail: 'coach@example.com',
        managerPhone: '0600000000',
      })
      .expect(201);

    const publishRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);
    const publishBody = publishRes.body as PublishResponseBody;

    expect(publishBody.status).toBe('PENDING_PAYMENT');
    expect(publishBody.checkoutUrl).toBe(
      'https://checkout.stripe.example/cs_test_publish_123',
    );
    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 1000, currency: 'eur' }),
    );

    const stillDraft = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}`),
    ).expect(200);
    expect((stillDraft.body as TournamentResponseBody).status).toBe('DRAFT');

    const webhookEvent = {
      type: 'checkout.session.completed',
      data: {
        object: { id: 'cs_test_publish_123', payment_intent: 'pi_test_789' },
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'test-signature')
      .send(webhookEvent)
      .expect(200, { received: true });

    const afterWebhook = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}`),
    ).expect(200);
    expect((afterWebhook.body as TournamentResponseBody).status).toBe(
      'PUBLISHED',
    );

    // A retried webhook delivery is a silent no-op, not a second charge.
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'test-signature')
      .send(webhookEvent)
      .expect(200, { received: true });
    expect(stripeService.createCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('does not re-charge when republishing a tournament that was already paid for', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe Republiee', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

    // No category/team at all -- computed fee is 0, publishes for free
    // immediately but still records a PAID order (amountCents 0).
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);
    expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/unpublish`),
    ).expect(200);

    const republishRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);
    expect((republishRes.body as TournamentResponseBody).status).toBe(
      'PUBLISHED',
    );
    expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('an active organization subscription covers publication for free, without a Stripe checkout', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const tournamentsBase = `/api/v1/organizations/${organizationId}/tournaments`;
    const subscriptionUrl = `/api/v1/organizations/${organizationId}/subscription`;

    const subscribeRes = await auth(
      request(app.getHttpServer()).post(subscriptionUrl),
    ).expect(201);
    const subscribeBody = subscribeRes.body as PublishResponseBody;
    expect(subscribeBody.status).toBe('PENDING_PAYMENT');
    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 20000, currency: 'eur' }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'test-signature')
      .send({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_publish_123',
            payment_intent: 'pi_test_sub_1',
          },
        },
      })
      .expect(200, { received: true });

    const statusRes = await auth(
      request(app.getHttpServer()).get(subscriptionUrl),
    ).expect(200);
    expect((statusRes.body as { status: string }).status).toBe('ACTIVE');

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;
    const tournamentRes = await auth(
      request(app.getHttpServer()).post(tournamentsBase),
    )
      .send({ name: 'Coupe Abonnement', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

    const categoryRes = await auth(
      request(app.getHttpServer()).post(
        `${tournamentsBase}/${tournamentId}/categories`,
      ),
    )
      .send({ name: 'Senior' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;
    await auth(
      request(app.getHttpServer()).post(
        `${tournamentsBase}/${tournamentId}/teams`,
      ),
    )
      .send({
        name: 'Lions',
        categoryId,
        managerEmail: 'coach@example.com',
        managerPhone: '0600000000',
      })
      .expect(201);

    stripeService.createCheckoutSession.mockClear();
    const publishRes = await auth(
      request(app.getHttpServer()).post(
        `${tournamentsBase}/${tournamentId}/publish`,
      ),
    ).expect(200);
    expect((publishRes.body as TournamentResponseBody).status).toBe(
      'PUBLISHED',
    );
    expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
  });
});
