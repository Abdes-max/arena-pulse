import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrganizationSubscriptionStatus } from '../generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { makeTournamentPublishable } from './utils/make-tournament-publishable';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

describe('Public tournament site (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('exposes a published tournament by slug, and only a published one', async () => {
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
    // register() no longer issues a session -- mark the test account
    // verified directly in DB (bypassing the email link) and log in.
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken } = loginRes.body as AuthResponseBody;
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const organizationId = (meRes.body as { organizations: { id: string }[] })
      .organizations[0].id;
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe Publique', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const slug = (tournamentRes.body as { slug: string }).slug;
    expect(slug).toMatch(/^coupe-publique-[0-9a-f]{8}$/);

    // A DRAFT tournament is not publicly reachable.
    await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}`)
      .expect(404);
    // Nor is a slug that doesn't exist at all — same 404, no leak either way.
    await request(app.getHttpServer())
      .get('/api/v1/public/tournaments/does-not-exist')
      .expect(404);

    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'Senior' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    const phaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Poules', type: 'GROUP_STAGE' })
      .expect(201);
    const phaseId = (phaseRes.body as { id: string }).id;

    const groupRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/groups`,
      ),
    )
      .send({ name: 'Poule A' })
      .expect(201);
    const groupId = (groupRes.body as { id: string }).id;

    const teamRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
    )
      .send({
        name: 'Lions',
        categoryId,
        managerEmail: 'coach@example.com',
        managerPhone: '0600000000',
      })
      .expect(201);
    const teamId = (teamRes.body as { id: string }).id;
    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/teams/${teamId}/group`,
      ),
    )
      .send({ groupId })
      .expect(200);

    // assertReadyToPublish requires at least one match once a real
    // GROUP_STAGE phase exists (see TournamentsService's own doc comment) --
    // a second team + generate-schedule below produces one.
    const secondTeamRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
    )
      .send({ name: 'Tigres', categoryId })
      .expect(201);
    const secondTeamId = (secondTeamRes.body as { id: string }).id;
    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/teams/${secondTeamId}/group`,
      ),
    )
      .send({ groupId })
      .expect(200);

    const venueRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/venues`),
    )
      .send({ name: 'Stade municipal', address: '1 rue du Stade' })
      .expect(201);
    const venueId = (venueRes.body as { id: string }).id;
    const fieldRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/venues/${venueId}/fields`,
      ),
    )
      .send({ name: 'Terrain 1' })
      .expect(201);
    const fieldId = (fieldRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({
        fieldIds: [fieldId],
        startDateTime: new Date().toISOString(),
      })
      .expect(201);

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);

    // Every public read below is unauthenticated — no Authorization header.
    const publicBase = `/api/v1/public/tournaments/${slug}`;

    const tournamentPublicRes = await request(app.getHttpServer())
      .get(publicBase)
      .expect(200);
    expect(tournamentPublicRes.body).toMatchObject({
      name: 'Coupe Publique',
      status: 'PUBLISHED',
    });
    expect(
      (tournamentPublicRes.body as { venues: { name: string }[] }).venues,
    ).toEqual([expect.objectContaining({ name: 'Stade municipal' })]);
    // organizationId/tournamentId are internal — must not leak to visitors.
    expect(tournamentPublicRes.body).not.toHaveProperty('organizationId');
    expect(tournamentPublicRes.body).not.toHaveProperty('tournamentId');

    const categoriesRes = await request(app.getHttpServer())
      .get(`${publicBase}/categories`)
      .expect(200);
    expect(categoriesRes.body).toEqual([
      expect.objectContaining({ id: categoryId }),
    ]);

    const phasesRes = await request(app.getHttpServer())
      .get(`${publicBase}/categories/${categoryId}/phases`)
      .expect(200);
    expect(phasesRes.body).toEqual([expect.objectContaining({ id: phaseId })]);

    const teamsRes = await request(app.getHttpServer())
      .get(`${publicBase}/teams`)
      .expect(200);
    // Two teams now -- Tigres exists only so generate-schedule below has
    // someone to pair Lions against (assertReadyToPublish requires a real
    // GROUP_STAGE phase to already have a match, see makeTournamentPublishable
    // and this test's own generate-schedule call).
    expect(teamsRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: teamId, name: 'Lions' }),
      ]),
    );
    expect(teamsRes.body).toHaveLength(2);
    for (const team of teamsRes.body as Record<string, unknown>[]) {
      expect(team).not.toHaveProperty('managerEmail');
      expect(team).not.toHaveProperty('managerPhone');
    }

    const teamDetailRes = await request(app.getHttpServer())
      .get(`${publicBase}/teams/${teamId}`)
      .expect(200);
    expect(teamDetailRes.body).toMatchObject({ id: teamId, name: 'Lions' });
    expect(teamDetailRes.body).not.toHaveProperty('managerEmail');
    expect((teamDetailRes.body as { matches: unknown[] }).matches).toHaveLength(
      1,
    );
    const { position } = (
      teamDetailRes.body as { standing: { position: number } }
    ).standing;
    expect(typeof position).toBe('number');

    const standingsRes = await request(app.getHttpServer())
      .get(`${publicBase}/groups/${groupId}/standings`)
      .expect(200);
    expect((standingsRes.body as { rows: unknown[] }).rows).toHaveLength(2);

    const qualificationsRes = await request(app.getHttpServer())
      .get(`${publicBase}/groups/${groupId}/qualifications`)
      .expect(200);
    expect(qualificationsRes.body).toEqual([]);

    const matchesRes = await request(app.getHttpServer())
      .get(`${publicBase}/phases/${phaseId}/matches`)
      .expect(200);
    expect(matchesRes.body).toHaveLength(1);
  });

  it("lists a tournament's soonest scheduled matches, in chronological order", async () => {
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
    // register() no longer issues a session -- mark the test account
    // verified directly in DB (bypassing the email link) and log in.
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken } = loginRes.body as AuthResponseBody;
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const organizationId = (meRes.body as { organizations: { id: string }[] })
      .organizations[0].id;
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe des Prochains Matchs', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const slug = (tournamentRes.body as { slug: string }).slug;

    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'Senior' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    const phaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Poules', type: 'GROUP_STAGE' })
      .expect(201);
    const phaseId = (phaseRes.body as { id: string }).id;

    const groupRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/groups`,
      ),
    )
      .send({ name: 'Poule A' })
      .expect(201);
    const groupId = (groupRes.body as { id: string }).id;

    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      const teamRes = await auth(
        request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
      )
        .send({ name, categoryId })
        .expect(201);
      const teamId = (teamRes.body as { id: string }).id;
      await auth(
        request(app.getHttpServer()).patch(
          `${base}/${tournamentId}/teams/${teamId}/group`,
        ),
      )
        .send({ groupId })
        .expect(200);
    }

    const venueRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/venues`),
    )
      .send({ name: 'Stade municipal' })
      .expect(201);
    const venueId = (venueRes.body as { id: string }).id;
    const fieldRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/venues/${venueId}/fields`,
      ),
    )
      .send({ name: 'Terrain 1' })
      .expect(201);
    const fieldId = (fieldRes.body as { id: string }).id;

    const farFuture = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds: [fieldId], startDateTime: farFuture })
      .expect(201);

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);

    const upcomingRes = await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}/matches/upcoming?limit=2`)
      .expect(200);
    const matches = upcomingRes.body as {
      timeSlot: { startTime: string } | null;
    }[];
    expect(matches).toHaveLength(2);
    expect(
      new Date(matches[0].timeSlot!.startTime).getTime(),
    ).toBeLessThanOrEqual(new Date(matches[1].timeSlot!.startTime).getTime());
  });

  it("exposes the organizer's chosen public theme, defaulting to INK_SIGNAL", async () => {
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
    // register() no longer issues a session -- mark the test account
    // verified directly in DB (bypassing the email link) and log in.
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken } = loginRes.body as AuthResponseBody;
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const organizationId = (meRes.body as { organizations: { id: string }[] })
      .organizations[0].id;
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe Thème', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const slug = (tournamentRes.body as { slug: string }).slug;
    expect(tournamentRes.body).toMatchObject({ theme: 'INK_SIGNAL' });

    // Choosing a non-default theme is a premium feature (see
    // TournamentsService.assertPremiumFeaturesUnlocked) -- this tournament
    // has 0 teams, so an active subscription is granted directly in the DB
    // to unlock it. Not what this test is about (theme propagation to the
    // public site), so bypassing the real Stripe checkout flow here.
    await prisma.organizationSubscription.create({
      data: {
        organizationId,
        status: OrganizationSubscriptionStatus.ACTIVE,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        amountCents: 20000,
        currency: 'eur',
        paidAt: new Date(),
      },
    });

    await auth(request(app.getHttpServer()).patch(`${base}/${tournamentId}`))
      .send({ theme: 'PULSE_EMBER' })
      .expect(200);

    await makeTournamentPublishable(app, auth, base, tournamentId);
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);

    const publicRes = await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}`)
      .expect(200);
    expect(publicRes.body).toMatchObject({ theme: 'PULSE_EMBER' });
  });

  it('excludes an unlisted tournament from the public directory while keeping it reachable by direct link', async () => {
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
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken } = loginRes.body as AuthResponseBody;
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const organizationId = (meRes.body as { organizations: { id: string }[] })
      .organizations[0].id;
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    // A tournament created without isListed defaults to listed (true) --
    // preserves the pre-existing behavior of every already-published
    // tournament (see the schema comment on Tournament.isListed).
    const listedRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe Listée', sportId })
      .expect(201);
    const listedId = (listedRes.body as { id: string }).id;
    const listedSlug = (listedRes.body as { slug: string }).slug;

    const unlistedRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe Privée', sportId })
      .expect(201);
    const unlistedId = (unlistedRes.body as { id: string }).id;
    const unlistedSlug = (unlistedRes.body as { slug: string }).slug;
    await auth(request(app.getHttpServer()).patch(`${base}/${unlistedId}`))
      .send({ isListed: false })
      .expect(200);

    await makeTournamentPublishable(app, auth, base, listedId);
    await auth(
      request(app.getHttpServer()).post(`${base}/${listedId}/publish`),
    ).expect(200);
    await makeTournamentPublishable(app, auth, base, unlistedId);
    await auth(
      request(app.getHttpServer()).post(`${base}/${unlistedId}/publish`),
    ).expect(200);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/public/tournaments')
      .expect(200);
    const directoryItems = listRes.body as Record<string, unknown>[];
    const slugsInDirectory = directoryItems.map((t) => t.slug);
    expect(slugsInDirectory).toContain(listedSlug);
    expect(slugsInDirectory).not.toContain(unlistedSlug);
    // isListed is an internal admin-only flag -- must never leak into the
    // public directory response.
    for (const item of directoryItems) {
      expect(item).not.toHaveProperty('isListed');
    }

    // Still fully reachable by its own direct link, per ADR 0006.
    await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${unlistedSlug}`)
      .expect(200);
  });
});
