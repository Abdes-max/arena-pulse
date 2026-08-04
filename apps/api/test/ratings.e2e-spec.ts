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

interface StandingRowResponseBody {
  teamId: string;
  teamName: string;
  rating: number;
  ratingDeviation: number;
  isProvisional: boolean;
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
  home: string,
  away: string,
): MatchResponseBody {
  const match = matches.find(
    (m) => m.homeTeam?.name === home && m.awayTeam?.name === away,
  );
  if (!match) {
    throw new Error(`Match ${home} vs ${away} not found`);
  }
  return match;
}

describe('Team ratings (e2e)', () => {
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

  /** Creates a single-group, single-match (Alpha vs Beta) tournament for the given organizer. */
  async function setUpSingleMatchTournament(
    auth: (req: request.Test) => request.Test,
    base: string,
    sportId: string,
    tournamentName: string,
  ) {
    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: tournamentName, sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

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
      .send({ name: 'Phase de poules', type: 'GROUP_STAGE' })
      .expect(201);
    const phaseId = (phaseRes.body as { id: string }).id;

    const groupRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/groups`,
      ),
    )
      .send({ name: 'Poule unique' })
      .expect(201);
    const groupId = (groupRes.body as { id: string }).id;

    for (const name of ['Alpha', 'Beta']) {
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

    const generateRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds: [fieldId], startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(201);

    return {
      tournamentId,
      groupId,
      matches: generateRes.body as MatchResponseBody[],
    };
  }

  it("updates both teams' rating after a validated match, and standings reflect it", async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const { tournamentId, groupId, matches } = await setUpSingleMatchTournament(
      auth,
      base,
      sportId,
      'Coupe',
    );
    const alphaBeta = findMatch(matches, 'Alpha', 'Beta');

    // Before any match: both teams show the default rating.
    const initialStandingsRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/groups/${groupId}/standings`,
      ),
    ).expect(200);
    const initialRows = (
      initialStandingsRes.body as { rows: StandingRowResponseBody[] }
    ).rows;
    expect(initialRows.every((row) => row.rating === 1500)).toBe(true);
    expect(initialRows.every((row) => row.isProvisional)).toBe(true);

    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaBeta.id}/score`,
      ),
    )
      .send({ homeScore: 2, awayScore: 0 })
      .expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaBeta.id}/score/validate`,
      ),
    ).expect(201);

    const standingsRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/groups/${groupId}/standings`,
      ),
    ).expect(200);
    const rows = (standingsRes.body as { rows: StandingRowResponseBody[] })
      .rows;
    const alphaRow = rows.find((row) => row.teamName === 'Alpha')!;
    const betaRow = rows.find((row) => row.teamName === 'Beta')!;
    expect(alphaRow.rating).toBeGreaterThan(1500);
    expect(betaRow.rating).toBeLessThan(1500);
  });

  it("carries a team's rating across tournaments within the same organization", async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const first = await setUpSingleMatchTournament(
      auth,
      base,
      sportId,
      'Coupe de printemps',
    );
    const firstMatch = findMatch(first.matches, 'Alpha', 'Beta');
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${first.tournamentId}/matches/${firstMatch.id}/score`,
      ),
    )
      .send({ homeScore: 3, awayScore: 0 })
      .expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${first.tournamentId}/matches/${firstMatch.id}/score/validate`,
      ),
    ).expect(201);

    const firstStandingsRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${first.tournamentId}/groups/${first.groupId}/standings`,
      ),
    ).expect(200);
    const firstRows = (
      firstStandingsRes.body as { rows: StandingRowResponseBody[] }
    ).rows;
    const alphaRatingAfterFirstTournament = firstRows.find(
      (row) => row.teamName === 'Alpha',
    )!.rating;
    expect(alphaRatingAfterFirstTournament).toBeGreaterThan(1500);

    // A brand-new tournament in the same organization, same team name --
    // this is what "persistent per organization" means: no reset to 1500.
    const second = await setUpSingleMatchTournament(
      auth,
      base,
      sportId,
      "Coupe d'automne",
    );
    const secondStandingsRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${second.tournamentId}/groups/${second.groupId}/standings`,
      ),
    ).expect(200);
    const secondRows = (
      secondStandingsRes.body as { rows: StandingRowResponseBody[] }
    ).rows;
    const alphaRatingInSecondTournament = secondRows.find(
      (row) => row.teamName === 'Alpha',
    )!.rating;

    expect(alphaRatingInSecondTournament).toBeCloseTo(
      alphaRatingAfterFirstTournament,
      6,
    );
    expect(alphaRatingInSecondTournament).toBeGreaterThan(1500);
  });
});
