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
  round: number;
  bracketSlot: number | null;
  isThirdPlaceMatch: boolean;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
}

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

describe('Knockout bracket generation and advancement (e2e)', () => {
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

  it('seeds round 1 from pool standings and auto-advances winners to the final and 3rd-place match', async () => {
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

    const poolPhaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Phase de poules', type: 'GROUP_STAGE' })
      .expect(201);
    const poolPhaseId = (poolPhaseRes.body as { id: string }).id;

    const bracketPhaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Finale', type: 'KNOCKOUT' })
      .expect(201);
    const bracketPhaseId = (bracketPhaseRes.body as { id: string }).id;

    const bracketRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${bracketPhaseId}/knockout-bracket`,
      ),
    )
      .send({ name: 'Finale', size: 4, hasRankingMatch: true })
      .expect(201);
    const bracketId = (bracketRes.body as { id: string }).id;

    const groupRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${poolPhaseId}/groups`,
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
      .send({ fromPosition: 1, toPosition: 4, targetPhaseId: bracketPhaseId })
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
        `${base}/${tournamentId}/phases/${poolPhaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds: [fieldId], startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(201);
    const poolMatches = generateRes.body as MatchResponseBody[];

    const winnerScore = (
      match: MatchResponseBody,
      winnerName: string,
      goals: number,
    ) =>
      match.homeTeam?.name === winnerName
        ? { homeScore: goals, awayScore: 0 }
        : { homeScore: 0, awayScore: goals };

    // Alpha wins every match => 1st; Beta beats Gamma and Delta => 2nd;
    // Gamma beats Delta => 3rd; Delta => 4th.
    for (const [match, winner, goals] of [
      [findMatch(poolMatches, 'Alpha', 'Beta'), 'Alpha', 3],
      [findMatch(poolMatches, 'Alpha', 'Gamma'), 'Alpha', 2],
      [findMatch(poolMatches, 'Alpha', 'Delta'), 'Alpha', 1],
      [findMatch(poolMatches, 'Beta', 'Gamma'), 'Beta', 2],
      [findMatch(poolMatches, 'Beta', 'Delta'), 'Beta', 2],
      [findMatch(poolMatches, 'Gamma', 'Delta'), 'Gamma', 1],
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

    const generatedRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/knockout-brackets/${bracketId}/generate-matches`,
      ),
    ).expect(201);
    const round1 = generatedRes.body as MatchResponseBody[];
    expect(round1).toHaveLength(2);
    // Standard 4-team seeding: seed1 (Alpha) vs seed4 (Delta), seed2 (Beta) vs seed3 (Gamma).
    const alphaDelta = findMatch(round1, 'Alpha', 'Delta');
    const betaGamma = findMatch(round1, 'Beta', 'Gamma');

    // Regenerating is rejected once matches already exist.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/knockout-brackets/${bracketId}/generate-matches`,
      ),
    ).expect(409);

    // Validating only one semifinal doesn't advance anything yet.
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    )
      .send({ homeScore: 3, awayScore: 0 })
      .expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score/validate`,
      ),
    ).expect(201);

    let matchesRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/knockout-brackets/${bracketId}/matches`,
      ),
    ).expect(200);
    expect(matchesRes.body as MatchResponseBody[]).toHaveLength(2);

    // Validating the second semifinal completes the round — the final and
    // the 3rd-place match (Gamma, the loser, is the only prior loser besides
    // Delta) should both appear automatically.
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${betaGamma.id}/score`,
      ),
    )
      .send({ homeScore: 2, awayScore: 1 })
      .expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${betaGamma.id}/score/validate`,
      ),
    ).expect(201);

    matchesRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/knockout-brackets/${bracketId}/matches`,
      ),
    ).expect(200);
    const allMatches = matchesRes.body as MatchResponseBody[];
    expect(allMatches).toHaveLength(4);

    const final = allMatches.find((m) => m.round === 2 && !m.isThirdPlaceMatch);
    const thirdPlace = allMatches.find(
      (m) => m.round === 2 && m.isThirdPlaceMatch,
    );
    expect(final).toBeTruthy();
    expect([final!.homeTeam?.name, final!.awayTeam?.name].sort()).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(thirdPlace).toBeTruthy();
    expect(
      [thirdPlace!.homeTeam?.name, thirdPlace!.awayTeam?.name].sort(),
    ).toEqual(['Delta', 'Gamma']);

    // Validating the final doesn't try to generate a 5th round.
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${final!.id}/score`,
      ),
    )
      .send({ homeScore: 1, awayScore: 0 })
      .expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${final!.id}/score/validate`,
      ),
    ).expect(201);

    matchesRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/knockout-brackets/${bracketId}/matches`,
      ),
    ).expect(200);
    expect(matchesRes.body as MatchResponseBody[]).toHaveLength(4);
  });
});
