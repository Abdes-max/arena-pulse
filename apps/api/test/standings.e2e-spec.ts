import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

interface MatchResponseBody {
  id: string;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
}

interface StandingRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  position: number;
}

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

async function firstSportId(
  app: INestApplication<App>,
  accessToken: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .get('/api/v1/sports')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  return (res.body as { id: string }[])[0].id;
}

function findMatch(
  matches: MatchResponseBody[],
  homeOrAway: string,
  other: string,
): MatchResponseBody {
  const match = matches.find(
    (m) =>
      (m.homeTeam?.name === homeOrAway && m.awayTeam?.name === other) ||
      (m.homeTeam?.name === other && m.awayTeam?.name === homeOrAway),
  );
  if (!match) {
    throw new Error(`Match ${homeOrAway} vs ${other} not found`);
  }
  return match;
}

describe('Standings and qualifications (e2e)', () => {
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

  it('computes standings from validated scores only, and reports qualifiers per rule', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'U10' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    const phaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Phase de poules', type: 'GROUP_STAGE' })
      .expect(201);
    const phaseId = (phaseRes.body as { id: string }).id;

    const targetPhaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Champions League', type: 'KNOCKOUT' })
      .expect(201);
    const targetPhaseId = (targetPhaseRes.body as { id: string }).id;

    const groupRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/groups`,
      ),
    )
      .send({ name: 'Poule A' })
      .expect(201);
    const groupId = (groupRes.body as { id: string }).id;

    const teamIds: Record<string, string> = {};
    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      const teamRes = await auth(
        request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
      )
        .send({ name, categoryId })
        .expect(201);
      const teamId = (teamRes.body as { id: string }).id;
      teamIds[name] = teamId;
      await auth(
        request(app.getHttpServer()).patch(
          `${base}/${tournamentId}/teams/${teamId}/group`,
        ),
      )
        .send({ groupId })
        .expect(200);
    }

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/groups/${groupId}/qualification-rules`,
      ),
    )
      .send({ fromPosition: 1, toPosition: 2, targetPhaseId })
      .expect(201);

    const venueRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/venues`),
    )
      .send({ name: 'Stade' })
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

    const generateRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds: [fieldId], startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(201);
    const matches = generateRes.body as MatchResponseBody[];

    // Before any score is entered, every team is level: standings fall back
    // to alphabetical order and nobody has "played" a match yet.
    const emptyStandingsRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/groups/${groupId}/standings`,
      ),
    ).expect(200);
    expect(
      (emptyStandingsRes.body as { rows: StandingRow[] }).rows,
    ).toHaveLength(4);
    expect((emptyStandingsRes.body as { isComplete: boolean }).isComplete).toBe(
      false,
    );

    // Alpha wins both its matches; Beta wins its remaining one. One score is
    // deliberately left unvalidated (provisional) and must not count.
    const alphaBeta = findMatch(matches, 'Alpha', 'Beta');
    const alphaGamma = findMatch(matches, 'Alpha', 'Gamma');
    const alphaDelta = findMatch(matches, 'Alpha', 'Delta');
    const betaGamma = findMatch(matches, 'Beta', 'Gamma');
    const betaDelta = findMatch(matches, 'Beta', 'Delta');
    const gammaDelta = findMatch(matches, 'Gamma', 'Delta');

    const winnerScore = (
      match: MatchResponseBody,
      winnerName: string,
      goals: number,
    ) =>
      match.homeTeam?.name === winnerName
        ? { homeScore: goals, awayScore: 0 }
        : { homeScore: 0, awayScore: goals };

    for (const [match, winner, goals] of [
      [alphaBeta, 'Alpha', 3],
      [alphaGamma, 'Alpha', 2],
      [alphaDelta, 'Alpha', 1],
      [betaGamma, 'Beta', 2],
      [betaDelta, 'Beta', 2],
    ] as const) {
      await auth(
        request(app.getHttpServer()).put(
          `${base}/${tournamentId}/matches/${match.id}/score`,
        ),
      )
        .send(winnerScore(match, winner, goals))
        .expect(200);
      await auth(
        request(app.getHttpServer()).post(
          `${base}/${tournamentId}/matches/${match.id}/score/validate`,
        ),
      ).expect(201);
    }
    // Gamma-vs-Delta stays provisional — must not affect the table.
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${gammaDelta.id}/score`,
      ),
    )
      .send({ homeScore: 1, awayScore: 1 })
      .expect(200);

    const standingsRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/groups/${groupId}/standings`,
      ),
    ).expect(200);
    const { rows, isComplete } = standingsRes.body as {
      rows: StandingRow[];
      isComplete: boolean;
    };
    expect(isComplete).toBe(false);
    expect(rows[0]).toMatchObject({
      teamName: 'Alpha',
      played: 3,
      won: 3,
      points: 9,
    });
    expect(rows[1]).toMatchObject({
      teamName: 'Beta',
      played: 3,
      won: 2,
      lost: 1,
      points: 6,
    });
    // Gamma and Delta each have 0 points from validated matches (their only
    // validated results are losses to Alpha/Beta); the provisional draw
    // between them isn't counted, so both show 2 games played, not 3.
    expect(rows[2].played).toBe(2);
    expect(rows[3].played).toBe(2);

    const qualificationsRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/groups/${groupId}/qualifications`,
      ),
    ).expect(200);
    const qualifications = qualificationsRes.body as {
      fromPosition: number;
      toPosition: number;
      targetPhaseName: string;
      qualifiedTeams: { id: string; name: string; position: number }[];
    }[];
    expect(qualifications).toHaveLength(1);
    expect(qualifications[0]).toMatchObject({
      fromPosition: 1,
      toPosition: 2,
      targetPhaseName: 'Champions League',
    });
    expect(qualifications[0].qualifiedTeams).toEqual([
      { id: teamIds['Alpha'], name: 'Alpha', position: 1 },
      { id: teamIds['Beta'], name: 'Beta', position: 2 },
    ]);
  });
});
