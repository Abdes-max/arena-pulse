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

interface RegistrationResponseBody {
  registrationId: string;
  status: string;
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

/**
 * A team manager: a TournArena account without an organization (one account
 * for managers and organizers), verified in DB like registerOrganizer above.
 */
async function registerPlayer(
  app: INestApplication<App>,
  email = 'player@example.com',
) {
  const password = 'a-very-strong-password';
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Léa', lastName: 'Martin' })
    .expect(201);
  await app
    .get(PrismaService)
    .user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return {
    accessToken: (loginRes.body as OrganizerAuthResponseBody).accessToken,
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
      maxTeams: number;
    }> = {},
    options: { sportName?: string; open?: boolean } = {},
  ) {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sports = sportRes.body as {
      id: string;
      name: string;
      scoreFormat: string;
    }[];
    const sportId = (
      options.sportName
        ? sports.find((sport) => sport.name === options.sportName)
        : sports.find((sport) => sport.scoreFormat === 'GOALS')
    )!.id;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe des Inscriptions', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const slug = (tournamentRes.body as { slug: string }).slug;

    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({
        name: 'Senior',
        registrationFeeCents: categoryOverrides.registrationFeeCents,
        registrationFeeCurrency: categoryOverrides.registrationFeeCurrency,
      })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;
    if (categoryOverrides.maxTeams) {
      await auth(
        request(app.getHttpServer()).patch(
          `${base}/${tournamentId}/categories/${categoryId}`,
        ),
      )
        .send({ maxTeams: categoryOverrides.maxTeams })
        .expect(200);
    }

    await makeTournamentPublishable(app, auth, base, tournamentId, categoryId);
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);
    if (options.open !== false) {
      await auth(
        request(app.getHttpServer()).patch(
          `${base}/${tournamentId}/registrations/settings`,
        ),
      )
        .send({ open: true, paymentInfo: '20 € à régler sur place' })
        .expect(200);
    }

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

  const register = (
    slug: string,
    categoryId: string,
    token: string,
    body: object,
  ) =>
    request(app.getHttpServer())
      .post(
        `/api/v1/public/tournaments/${slug}/categories/${categoryId}/registrations`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('creates a pending pre-registration; the team only joins once the organizer confirms it', async () => {
    const { slug, categoryId, auth, base, tournamentId } =
      await setupPublishedTournament(app, {
        registrationFeeCents: 2000,
      });
    const { accessToken: playerToken } = await registerPlayer(app);

    const res = await register(slug, categoryId, playerToken, roster).expect(
      201,
    );
    const body = res.body as RegistrationResponseBody;
    expect(body).toMatchObject({ status: 'PENDING', checkoutUrl: null });
    // No online payment any more.
    expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();

    const teamsBefore = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}/teams`),
    ).expect(200);
    expect(teamsBefore.body).toEqual([]);

    const confirmed = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/registrations/${body.registrationId}/confirm`,
      ),
    ).expect(200);
    const rows = confirmed.body as (OrganizerRegistrationRow & {
      paymentStatus: string;
    })[];
    expect(rows[0]).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      amountCents: 2000,
    });
    expect(rows[0].teamId).toEqual(expect.any(String));

    // The manager's space counts it, with the team's (still empty) record.
    const stats = await request(app.getHttpServer())
      .get('/api/v1/public/registrations/me/stats')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    expect(stats.body).toMatchObject({
      registrations: { total: 1, confirmed: 1, pending: 0 },
      tournaments: 1,
      totals: { played: 0, won: 0 },
      teams: [expect.objectContaining({ teamName: roster.teamName })],
    });

    const teamsAfter = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}/teams`),
    ).expect(200);
    expect(teamsAfter.body).toEqual([
      expect.objectContaining({ id: rows[0].teamId, name: roster.teamName }),
    ]);

    // Payment collected on site, ticked by hand.
    const paid = await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/registrations/${body.registrationId}/payment`,
      ),
    )
      .send({ paymentStatus: 'PAID' })
      .expect(200);
    expect((paid.body as { paymentStatus: string }[])[0].paymentStatus).toBe(
      'PAID',
    );
  });

  it('registers a team without its roster, but never without a phone number', async () => {
    const { slug, categoryId } = await setupPublishedTournament(app, {});
    const { accessToken: playerToken } = await registerPlayer(app);
    const team = {
      teamName: 'Les Faucons',
      managerEmail: 'coach@example.com',
    };

    await register(slug, categoryId, playerToken, team).expect(400);
    await register(slug, categoryId, playerToken, {
      ...team,
      managerPhone: '06 12 34 56 78',
    }).expect(201);
  });

  it('registers several numbered teams at once, within the per-manager limit', async () => {
    const { slug, categoryId, auth, base, tournamentId } =
      await setupPublishedTournament(app, {});
    const { accessToken: playerToken } = await registerPlayer(app);
    const club = {
      teamName: 'ET.S Milloise',
      // A club picked from the directory travels with the request.
      externalClubId: 'fff:553079',
      managerEmail: 'coach@example.com',
      managerPhone: '06 12 34 56 78',
    };

    // One team per manager unless the organizer raises it.
    await register(slug, categoryId, playerToken, {
      ...club,
      teamCount: 2,
    }).expect(409);

    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/registrations/settings`,
      ),
    )
      .send({ maxTeamsPerRegistrant: 3 })
      .expect(200);
    const res = await register(slug, categoryId, playerToken, {
      ...club,
      teamCount: 2,
    }).expect(201);
    expect(
      (res.body as { registrationIds: string[] }).registrationIds,
    ).toHaveLength(2);

    const mine = await request(app.getHttpServer())
      .get('/api/v1/public/registrations/me')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    expect(
      (mine.body as { teamName: string }[]).map((r) => r.teamName).sort(),
    ).toEqual(['ET.S Milloise 1', 'ET.S Milloise 2']);

    // 2 of 3 used: two more is over the limit.
    await register(slug, categoryId, playerToken, {
      ...club,
      teamName: 'ET.S Milloise B',
      teamCount: 2,
    }).expect(409);
  });

  it('refuses requests while registrations are closed', async () => {
    const { slug, categoryId } = await setupPublishedTournament(
      app,
      {},
      { open: false },
    );
    const { accessToken: playerToken } = await registerPlayer(app);

    await register(slug, categoryId, playerToken, roster).expect(409);

    const info = await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}/registration-info`)
      .expect(200);
    expect(info.body).toMatchObject({ open: false, participantType: 'TEAM' });
  });

  it('puts requests on the waiting list once the category is full', async () => {
    const { slug, categoryId, auth, base, tournamentId } =
      await setupPublishedTournament(app, {
        maxTeams: 1,
      });
    const { accessToken: first } = await registerPlayer(app);
    const { accessToken: second } = await registerPlayer(
      app,
      'second@example.com',
    );

    const one = await register(slug, categoryId, first, roster).expect(201);
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/registrations/${(one.body as RegistrationResponseBody).registrationId}/confirm`,
      ),
    ).expect(200);

    const two = await register(slug, categoryId, second, {
      ...roster,
      teamName: 'Les Faucons',
    }).expect(201);
    expect((two.body as RegistrationResponseBody).status).toBe('WAITLIST');

    // No place left: confirming it is refused.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/registrations/${(two.body as RegistrationResponseBody).registrationId}/confirm`,
      ),
    ).expect(409);

    const info = await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}/registration-info`)
      .expect(200);
    expect(
      (info.body as { categories: { remaining: number }[] }).categories[0]
        .remaining,
    ).toBe(0);
  });

  it("counts the category's actual teams as places, and frees a deleted team's", async () => {
    const { slug, categoryId, auth, base, tournamentId } =
      await setupPublishedTournament(app, { maxTeams: 2 });
    const remaining = async () =>
      (
        (
          await request(app.getHttpServer())
            .get(`/api/v1/public/tournaments/${slug}/registration-info`)
            .expect(200)
        ).body as { categories: { remaining: number }[] }
      ).categories[0].remaining;

    // A team the organizer adds themselves takes a place too.
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
    )
      .send({ name: 'Les Hiboux', categoryId })
      .expect(201);
    expect(await remaining()).toBe(1);

    const { accessToken } = await registerPlayer(app);
    const sent = await register(slug, categoryId, accessToken, roster).expect(
      201,
    );
    const registrationId = (sent.body as RegistrationResponseBody)
      .registrationId;
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/registrations/${registrationId}/confirm`,
      ),
    ).expect(200);
    expect(await remaining()).toBe(0);

    // The organizer deletes the confirmed team: its place is free again and
    // the request no longer counts as registered.
    const { teamId } = await prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
    });
    await auth(
      request(app.getHttpServer()).delete(
        `${base}/${tournamentId}/teams/${teamId}`,
      ),
    ).expect(204);
    expect(await remaining()).toBe(1);
    expect(
      (
        await prisma.registration.findUniqueOrThrow({
          where: { id: registrationId },
        })
      ).status,
    ).toBe('REJECTED');
  });

  it('registers a single player, named after them, for an individual sport', async () => {
    const { slug, categoryId } = await setupPublishedTournament(
      app,
      {},
      { sportName: 'Tennis' },
    );
    const { accessToken: playerToken } = await registerPlayer(app);
    const player = { firstName: 'Rafa', lastName: 'Nadal' };

    // Two players is a team, not an individual registration.
    await register(slug, categoryId, playerToken, {
      managerEmail: 'rafa@example.com',
      managerPhone: '0611111111',
      players: [player, { firstName: 'Roger', lastName: 'Federer' }],
    }).expect(400);

    await register(slug, categoryId, playerToken, {
      managerEmail: 'rafa@example.com',
      managerPhone: '0611111111',
      players: [player],
    }).expect(201);
    const mine = await request(app.getHttpServer())
      .get('/api/v1/public/registrations/me')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    expect((mine.body as { teamName: string }[])[0].teamName).toBe(
      'Rafa Nadal',
    );
  });

  it('lets the player withdraw a request that is not confirmed yet', async () => {
    const { slug, categoryId } = await setupPublishedTournament(app);
    const { accessToken: playerToken } = await registerPlayer(app);
    const res = await register(slug, categoryId, playerToken, roster).expect(
      201,
    );

    const after = await request(app.getHttpServer())
      .post(
        `/api/v1/public/registrations/${(res.body as RegistrationResponseBody).registrationId}/cancel`,
      )
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    expect((after.body as { status: string }[])[0].status).toBe('CANCELLED');
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

  it('lets a team manager account (no organization) start organizing', async () => {
    const { accessToken } = await registerPlayer(app);
    const me = () =>
      request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    expect((await me()).body).toMatchObject({ organizations: [] });

    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Les Faucons Organisation' })
      .expect(201);
    expect(
      ((await me()).body as { organizations: { name: string }[] })
        .organizations,
    ).toEqual([expect.objectContaining({ name: 'Les Faucons Organisation' })]);

    // One organization per account, as at sign-up.
    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Encore une' })
      .expect(409);
  });

  it('requires a signed-in account to submit a registration', async () => {
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
      status: 'PENDING',
    });
    expect(meBody[0].tournament.slug).toBe(slug);
  });
});
