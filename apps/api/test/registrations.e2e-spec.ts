import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type Stripe from 'stripe';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { StripeService } from '../src/payments/stripe.service';
import { createTestApp } from './utils/bootstrap-app';
import { makeTournamentPublishable } from './utils/make-tournament-publishable';
import { resetDatabase } from './utils/reset-database';

interface OrganizerAuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

interface PlayerAuthResponseBody {
  accessToken: string;
  playerAccount: { id: string };
}

interface RegistrationResponseBody {
  registrationId: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED';
  checkoutUrl: string | null;
}

interface OrganizerRegistrationRow {
  id: string;
  status: string;
  teamId: string | null;
  amountCents: number;
  currency: string;
  paidAt: string | null;
}

// A stubbed StripeService -- no e2e spec talks to the real Stripe API. See
// docs/architecture/adr/0005-player-registration-and-payments.md.
const stripeService = {
  createCheckoutSession: jest.fn().mockResolvedValue({
    id: 'cs_test_123',
    url: 'https://checkout.stripe.example/cs_test_123',
  }),
  constructWebhookEvent: jest.fn(
    (payload: Buffer) => JSON.parse(payload.toString()) as Stripe.Event,
  ),
  retrieveCheckoutSession: jest.fn(),
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
  const { accessToken } = loginRes.body as OrganizerAuthResponseBody;
  const meRes = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  const { organizations } = meRes.body as { organizations: { id: string }[] };
  return { accessToken, organizationId: organizations[0].id };
}

async function registerPlayer(
  app: INestApplication<App>,
  email = 'player@example.com',
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/player-auth/register')
    .send({
      email,
      password: 'a-very-strong-password',
      firstName: 'Léa',
      lastName: 'Martin',
    })
    .expect(201);
  const body = res.body as PlayerAuthResponseBody;
  return {
    accessToken: body.accessToken,
    playerAccountId: body.playerAccount.id,
  };
}

describe('Registrations & payments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    stripeService.createCheckoutSession.mockClear();
    stripeService.constructWebhookEvent.mockClear();
    stripeService.retrieveCheckoutSession.mockReset();
    app = await createTestApp((builder) =>
      builder.overrideProvider(StripeService).useValue(stripeService),
    );
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  /** Creates + publishes a tournament with one category, returns everything a test needs. */
  async function setupPublishedTournament(
    app: INestApplication<App>,
    categoryOverrides: Partial<{
      registrationFeeCents: number;
      registrationFeeCurrency: string;
    }> = {},
  ) {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe des Inscriptions', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const slug = (tournamentRes.body as { slug: string }).slug;

    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'Senior', ...categoryOverrides })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    await makeTournamentPublishable(app, auth, base, tournamentId, categoryId);
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);

    return {
      accessToken,
      organizationId,
      tournamentId,
      slug,
      categoryId,
      auth,
      base,
    };
  }

  const roster = {
    teamName: 'Les Aigles',
    managerEmail: 'coach@example.com',
    managerPhone: '0600000000',
    players: [
      { firstName: 'Marc', lastName: 'Durand', jerseyNumber: 10 },
      { firstName: 'Julie', lastName: 'Petit' },
    ],
  };

  it('creates a free registration and materializes the team+players immediately', async () => {
    const { slug, categoryId, auth, base, organizationId, tournamentId } =
      await setupPublishedTournament(app);
    const { accessToken: playerToken } = await registerPlayer(app);

    const res = await request(app.getHttpServer())
      .post(
        `/api/v1/public/tournaments/${slug}/categories/${categoryId}/registrations`,
      )
      .set('Authorization', `Bearer ${playerToken}`)
      .send(roster)
      .expect(201);
    const body = res.body as RegistrationResponseBody;

    expect(body.status).toBe('PAID');
    expect(body.checkoutUrl).toBeNull();
    expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();

    const listRes = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}/registrations`),
    ).expect(200);
    const rows = listRes.body as OrganizerRegistrationRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: body.registrationId,
      status: 'PAID',
      amountCents: 0,
    });
    expect(rows[0].teamId).toEqual(expect.any(String));

    const teamsRes = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}/teams`),
    ).expect(200);
    expect(teamsRes.body).toEqual([
      expect.objectContaining({ id: rows[0].teamId, name: roster.teamName }),
    ]);

    void organizationId;
  });

  it('creates a Stripe checkout session for a paid category, then materializes the team once the webhook confirms payment', async () => {
    const { slug, categoryId, auth, base, tournamentId } =
      await setupPublishedTournament(app, {
        registrationFeeCents: 2500,
        registrationFeeCurrency: 'eur',
      });
    const { accessToken: playerToken } = await registerPlayer(app);

    const res = await request(app.getHttpServer())
      .post(
        `/api/v1/public/tournaments/${slug}/categories/${categoryId}/registrations`,
      )
      .set('Authorization', `Bearer ${playerToken}`)
      .send(roster)
      .expect(201);
    const body = res.body as RegistrationResponseBody;

    expect(body.status).toBe('PENDING_PAYMENT');
    expect(body.checkoutUrl).toBe(
      'https://checkout.stripe.example/cs_test_123',
    );
    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 2500,
        currency: 'eur',
        metadata: { registrationId: body.registrationId },
      }),
    );

    const beforeWebhook = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}/registrations`),
    ).expect(200);
    expect((beforeWebhook.body as OrganizerRegistrationRow[])[0]).toMatchObject(
      {
        status: 'PENDING_PAYMENT',
        teamId: null,
      },
    );

    const webhookEvent = {
      type: 'checkout.session.completed',
      data: {
        object: { id: 'cs_test_123', payment_intent: 'pi_test_456' },
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'test-signature')
      .send(webhookEvent)
      .expect(200, { received: true });

    const afterWebhook = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}/registrations`),
    ).expect(200);
    const row = (afterWebhook.body as OrganizerRegistrationRow[])[0];
    expect(row.status).toBe('PAID');
    expect(row.teamId).toEqual(expect.any(String));
    expect(row.paidAt).not.toBeNull();

    // A retried webhook delivery for the same session is a silent no-op, not a duplicate team.
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'test-signature')
      .send(webhookEvent)
      .expect(200, { received: true });

    const teamsRes = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}/teams`),
    ).expect(200);
    expect(teamsRes.body).toHaveLength(1);
  });

  it('confirms a pending registration directly against Stripe when the player lands back on the success page before the webhook arrives', async () => {
    const { slug, categoryId, auth, base, tournamentId } =
      await setupPublishedTournament(app, {
        registrationFeeCents: 2500,
        registrationFeeCurrency: 'eur',
      });
    const { accessToken: playerToken } = await registerPlayer(app);

    const res = await request(app.getHttpServer())
      .post(
        `/api/v1/public/tournaments/${slug}/categories/${categoryId}/registrations`,
      )
      .set('Authorization', `Bearer ${playerToken}`)
      .send(roster)
      .expect(201);
    const body = res.body as RegistrationResponseBody;

    // Webhook hasn't landed yet -- Stripe itself reports the session as paid.
    stripeService.retrieveCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      payment_intent: 'pi_test_confirm_456',
    });

    const confirmRes = await request(app.getHttpServer())
      .post('/api/v1/public/registrations/confirm')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ sessionId: 'cs_test_123' })
      .expect(200);

    expect(stripeService.retrieveCheckoutSession).toHaveBeenCalledWith(
      'cs_test_123',
    );
    const confirmed = (
      confirmRes.body as { id: string; status: string }[]
    ).find((r) => r.id === body.registrationId);
    expect(confirmed?.status).toBe('PAID');

    const afterConfirm = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}/registrations`),
    ).expect(200);
    const row = (afterConfirm.body as OrganizerRegistrationRow[])[0];
    expect(row.status).toBe('PAID');
    expect(row.teamId).toEqual(expect.any(String));

    // The webhook arriving afterwards for the same session is a silent no-op, not a duplicate team.
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'test-signature')
      .send({
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_test_123', payment_intent: 'pi_test_confirm_456' },
        },
      })
      .expect(200, { received: true });

    const teamsRes = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}/teams`),
    ).expect(200);
    expect(teamsRes.body).toHaveLength(1);
  });

  it('does not confirm a registration belonging to another player', async () => {
    const { slug, categoryId } = await setupPublishedTournament(app, {
      registrationFeeCents: 2500,
      registrationFeeCurrency: 'eur',
    });
    const { accessToken: playerToken } = await registerPlayer(app);
    const { accessToken: otherPlayerToken } = await registerPlayer(
      app,
      'other-player@example.com',
    );

    await request(app.getHttpServer())
      .post(
        `/api/v1/public/tournaments/${slug}/categories/${categoryId}/registrations`,
      )
      .set('Authorization', `Bearer ${playerToken}`)
      .send(roster)
      .expect(201);

    stripeService.retrieveCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      payment_intent: 'pi_test_other_456',
    });

    await request(app.getHttpServer())
      .post('/api/v1/public/registrations/confirm')
      .set('Authorization', `Bearer ${otherPlayerToken}`)
      .send({ sessionId: 'cs_test_123' })
      .expect(200);

    expect(stripeService.retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects a webhook request with no signature header', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .send({ type: 'checkout.session.completed' })
      .expect(400);
  });

  it('rejects a registration for a team name already used in the tournament', async () => {
    const { slug, categoryId } = await setupPublishedTournament(app);
    const { accessToken: playerToken } = await registerPlayer(app);
    const { accessToken: otherPlayerToken } = await registerPlayer(
      app,
      'other-player@example.com',
    );

    await request(app.getHttpServer())
      .post(
        `/api/v1/public/tournaments/${slug}/categories/${categoryId}/registrations`,
      )
      .set('Authorization', `Bearer ${playerToken}`)
      .send(roster)
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/v1/public/tournaments/${slug}/categories/${categoryId}/registrations`,
      )
      .set('Authorization', `Bearer ${otherPlayerToken}`)
      .send(roster)
      .expect(409);
  });

  it('requires a player access token to submit a registration', async () => {
    const { slug, categoryId } = await setupPublishedTournament(app);

    await request(app.getHttpServer())
      .post(
        `/api/v1/public/tournaments/${slug}/categories/${categoryId}/registrations`,
      )
      .send(roster)
      .expect(401);
  });

  it("lists a player's own registrations across tournaments", async () => {
    const { slug, categoryId } = await setupPublishedTournament(app);
    const { accessToken: playerToken } = await registerPlayer(app);

    await request(app.getHttpServer())
      .post(
        `/api/v1/public/tournaments/${slug}/categories/${categoryId}/registrations`,
      )
      .set('Authorization', `Bearer ${playerToken}`)
      .send(roster)
      .expect(201);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/public/registrations/me')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    const meBody = meRes.body as {
      teamName: string;
      status: string;
      tournament: { slug: string };
    }[];
    expect(meBody).toHaveLength(1);
    expect(meBody[0]).toMatchObject({
      teamName: roster.teamName,
      status: 'PAID',
    });
    expect(meBody[0].tournament.slug).toBe(slug);
  });
});
