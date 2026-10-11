import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { makeTournamentPublishable } from './utils/make-tournament-publishable';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
}

/**
 * "Tournoi Wrapped" (GET /public/tournaments/:slug/wrapped) -- see this
 * feature's plan doc (adaptive-leaping-elephant.md, "Tournoi Wrapped") for
 * the design. Covers the premium gate (locked below freeMaxTeams) and, once
 * unlocked, that a real validated score flows all the way through to the
 * recap's goals/outcomes/champion.
 */
describe('Tournoi Wrapped (e2e)', () => {
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

  async function registerOrganizerAndCreateTournament(name: string) {
    const email = `${name.toLowerCase().replace(/\s+/g, '-')}@example.com`;
    const password = 'a-very-strong-password';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        firstName: 'Ada',
        lastName: 'Lovelace',
        organizationName: name,
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
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const meRes = await auth(
      request(app.getHttpServer()).get('/api/v1/auth/me'),
    ).expect(200);
    const organizationId = (meRes.body as { organizations: { id: string }[] })
      .organizations[0].id;
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: `${name} Cup`, sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const slug = (tournamentRes.body as { slug: string }).slug;

    return { auth, base, organizationId, tournamentId, slug };
  }

  async function addTeams(
    auth: (req: request.Test) => request.Test,
    base: string,
    tournamentId: string,
    categoryId: string,
    names: string[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const teamName of names) {
      const res = await auth(
        request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
      )
        .send({ name: teamName, categoryId })
        .expect(201);
      ids.push((res.body as { id: string }).id);
    }
    return ids;
  }

  it('stays locked for a tournament at or below the free team threshold', async () => {
    const { auth, base, tournamentId, slug } =
      await registerOrganizerAndCreateTournament('Petit Club');
    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'Seniors' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;
    // Publish while still empty (fee is computed from team count at publish
    // time, so 0 teams means free/immediate) -- getPublicBySlug 404s on a
    // non-published tournament regardless of the premium gate below.
    await makeTournamentPublishable(app, auth, base, tournamentId, categoryId);
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);
    // 3 teams is well under the default free threshold (8) -- no active
    // subscription either, so this must stay locked.
    await addTeams(auth, base, tournamentId, categoryId, ['A', 'B', 'C']);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}/wrapped`)
      .expect(200);
    expect(res.body).toEqual({ unlocked: false });

    // The main tournament payload agrees -- this is what TournamentShell
    // actually reads to decide whether to show the "Récap" tab.
    const tournamentRes = await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}`)
      .expect(200);
    expect(
      (tournamentRes.body as { wrappedUnlocked: boolean }).wrappedUnlocked,
    ).toBe(false);
  });

  it('unlocks once a tournament has more teams than the free threshold, and reports the goals/outcome/champion of a real validated score', async () => {
    const { auth, base, tournamentId, slug, organizationId } =
      await registerOrganizerAndCreateTournament('Grand Club');
    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'Seniors' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;
    // An active annual subscription unlocks Wrapped regardless of team count
    // (TournamentsService.hasPremiumFeatures: "hasActiveSubscription ||
    // teamsCount > freeMaxTeams") and also waives the publish fee outright
    // -- granted directly here rather than driving the real Stripe
    // checkout+webhook flow (see tournament-publication.e2e-spec.ts for
    // that full flow), since this spec is about the Wrapped payload, not
    // about payments.
    await prisma.organizationSubscription.create({
      data: {
        organizationId,
        status: 'ACTIVE',
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        amountCents: 20000,
        currency: 'eur',
      },
    });
    await makeTournamentPublishable(app, auth, base, tournamentId, categoryId);
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);

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
      .send({ name: 'A' })
      .expect(201);
    const groupId = (groupRes.body as { id: string }).id;

    const [teamAId, teamBId] = await addTeams(
      auth,
      base,
      tournamentId,
      categoryId,
      ['Les Copains du Nord', 'FC Lendemain'],
    );
    for (const teamId of [teamAId, teamBId]) {
      await auth(
        request(app.getHttpServer()).patch(
          `${base}/${tournamentId}/teams/${teamId}/group`,
        ),
      )
        .send({ groupId })
        .expect(200);
    }

    const match = await prisma.match.create({
      data: { groupId, round: 1, homeTeamId: teamAId, awayTeamId: teamBId },
    });
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${match.id}/score`,
      ),
    )
      .send({ homeScore: 3, awayScore: 1 })
      .expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${match.id}/score/validate`,
      ),
    ).expect(201);

    const wrappedRes = await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}/wrapped`)
      .expect(200);
    const wrapped = wrappedRes.body as {
      unlocked: true;
      organisation: { teamsCount: number };
      goals: { totalGoals: number; matchesPlayed: number };
      outcomes: {
        homeWin: number;
        awayWin: number;
        draw: number;
        shootout: number;
      };
      level: {
        champions: { categoryId: string; teamName: string; rating: number }[];
      };
    };
    expect(wrapped.unlocked).toBe(true);
    expect(wrapped.organisation.teamsCount).toBe(2);
    expect(wrapped.goals.totalGoals).toBe(4);
    expect(wrapped.goals.matchesPlayed).toBe(1);
    expect(wrapped.outcomes).toEqual({
      homeWin: 1,
      awayWin: 0,
      draw: 0,
      shootout: 0,
    });
    // Pools-only category, a single group -- the recorded winner (rank 1 of
    // the group's own standings) is the sole source of the champion here,
    // never guessed at from the score directly.
    expect(wrapped.level.champions).toHaveLength(1);
    expect(wrapped.level.champions[0]).toMatchObject({
      categoryId,
      categoryName: 'Seniors',
      teamName: 'Les Copains du Nord',
    });
    expect(wrapped.level.champions[0].rating).not.toBe(1500);
  });
});
