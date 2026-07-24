import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrganizationRole } from '../generated/prisma/client';
import { PasswordService } from '../src/auth/password.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

interface MatchResponseBody {
  id: string;
  status: string;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  forfeitedTeam: { id: string; name: string } | null;
  score: {
    homeScore: number;
    awayScore: number;
    homePenaltyScore: number | null;
    awayPenaltyScore: number | null;
    isValidated: boolean;
    validatedAt: string | null;
  } | null;
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

async function addOrganizationMember(
  app: INestApplication<App>,
  organizationId: string,
  email: string,
  password: string,
) {
  const prisma = app.get(PrismaService);
  const passwordService = app.get(PasswordService);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await passwordService.hash(password),
      firstName: 'Rui',
      lastName: 'Referee',
    },
  });
  await prisma.organizationMember.create({
    data: {
      organizationId,
      userId: user.id,
      role: OrganizationRole.ORG_MEMBER,
    },
  });
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return { accessToken: (loginRes.body as AuthResponseBody).accessToken };
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

describe('Scorekeeping (e2e)', () => {
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

  async function setUpGeneratedSchedule(
    app: INestApplication<App>,
    auth: (req: request.Test) => request.Test,
    base: string,
    tournamentId: string,
  ) {
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
      groupId,
      teamIds,
      matches: generateRes.body as MatchResponseBody[],
    };
  }

  it('enters a provisional score, corrects it, then validates it', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { matches } = await setUpGeneratedSchedule(
      app,
      auth,
      base,
      tournamentId,
    );
    const alphaDelta = findMatch(matches, 'Alpha', 'Delta');

    // Validating before any score is entered is rejected.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score/validate`,
      ),
    ).expect(400);

    const enteredRes = await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    )
      .send({ homeScore: 2, awayScore: 1 })
      .expect(200);
    const entered = enteredRes.body as MatchResponseBody;
    expect(entered.status).toBe('LIVE');
    expect(entered.score).toMatchObject({
      homeScore: 2,
      awayScore: 1,
      isValidated: false,
    });

    // Correcting the score before validation just overwrites it.
    const correctedRes = await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    )
      .send({ homeScore: 3, awayScore: 1 })
      .expect(200);
    expect((correctedRes.body as MatchResponseBody).score).toMatchObject({
      homeScore: 3,
      awayScore: 1,
      isValidated: false,
    });

    const validatedRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score/validate`,
      ),
    ).expect(201);
    const validated = validatedRes.body as MatchResponseBody;
    expect(validated.status).toBe('COMPLETED');
    expect(validated.score).toMatchObject({ isValidated: true });
    expect(validated.score!.validatedAt).not.toBeNull();

    // Correcting a validated score reverts it to provisional and the match to live.
    const reopenedRes = await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    )
      .send({ homeScore: 3, awayScore: 2 })
      .expect(200);
    expect((reopenedRes.body as MatchResponseBody).status).toBe('LIVE');
    expect((reopenedRes.body as MatchResponseBody).score).toMatchObject({
      isValidated: false,
    });

    // Clearing removes the score and reverts the match to scheduled.
    const clearedRes = await auth(
      request(app.getHttpServer()).delete(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    ).expect(200);
    expect((clearedRes.body as MatchResponseBody).status).toBe('SCHEDULED');
    expect((clearedRes.body as MatchResponseBody).score).toBeNull();
  });

  it('requires a penalty shootout to validate a draw when the group enables it', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { groupId, matches } = await setUpGeneratedSchedule(
      app,
      auth,
      base,
      tournamentId,
    );
    const alphaDelta = findMatch(matches, 'Alpha', 'Delta');

    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/groups/${groupId}/standing-rule`,
      ),
    )
      .send({ penaltyShootoutEnabled: true })
      .expect(200);

    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    )
      .send({ homeScore: 1, awayScore: 1 })
      .expect(200);

    // A draw with penalty shootouts enabled cannot be validated without a shootout.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score/validate`,
      ),
    ).expect(400);

    // A penalty score not entered for both sides at once is rejected.
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    )
      .send({ homeScore: 1, awayScore: 1, homePenaltyScore: 5 })
      .expect(400);

    // A tied shootout still doesn't designate a winner.
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    )
      .send({
        homeScore: 1,
        awayScore: 1,
        homePenaltyScore: 4,
        awayPenaltyScore: 4,
      })
      .expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score/validate`,
      ),
    ).expect(400);

    // A decisive shootout validates.
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    )
      .send({
        homeScore: 1,
        awayScore: 1,
        homePenaltyScore: 5,
        awayPenaltyScore: 4,
      })
      .expect(200);
    const validatedRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score/validate`,
      ),
    ).expect(201);
    expect((validatedRes.body as MatchResponseBody).status).toBe('COMPLETED');
  });

  it('declares and undoes a forfeit, blocking score entry while forfeited', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { teamIds, matches } = await setUpGeneratedSchedule(
      app,
      auth,
      base,
      tournamentId,
    );
    const alphaDelta = findMatch(matches, 'Alpha', 'Delta');

    // A team not in the match can't be declared the forfeiting side.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/forfeit`,
      ),
    )
      .send({ teamId: teamIds['Beta'] })
      .expect(400);

    const forfeitRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/forfeit`,
      ),
    )
      .send({ teamId: teamIds['Delta'] })
      .expect(201);
    expect((forfeitRes.body as MatchResponseBody).status).toBe('FORFEITED');
    expect((forfeitRes.body as MatchResponseBody).forfeitedTeam).toMatchObject({
      id: teamIds['Delta'],
    });

    // Scores can't be entered on a forfeited match.
    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/score`,
      ),
    )
      .send({ homeScore: 3, awayScore: 0 })
      .expect(409);

    const undoRes = await auth(
      request(app.getHttpServer()).delete(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/forfeit`,
      ),
    ).expect(200);
    expect((undoRes.body as MatchResponseBody).status).toBe('SCHEDULED');
    expect((undoRes.body as MatchResponseBody).forfeitedTeam).toBeNull();

    // Undoing again (no longer forfeited) is rejected.
    await auth(
      request(app.getHttpServer()).delete(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/forfeit`,
      ),
    ).expect(400);
  });

  it('gates score entry behind MANAGE_SCORES', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { matches } = await setUpGeneratedSchedule(
      app,
      auth,
      base,
      tournamentId,
    );
    const someMatch = matches[0];

    const member = await addOrganizationMember(
      app,
      organizationId,
      'member@example.com',
      'a-very-strong-password',
    );
    const authAsMember = (req: request.Test) =>
      req.set('Authorization', `Bearer ${member.accessToken}`);

    await authAsMember(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${someMatch.id}/score`,
      ),
    )
      .send({ homeScore: 1, awayScore: 0 })
      .expect(403);

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/administrators`,
      ),
    )
      .send({
        email: 'member@example.com',
        permissionKeys: ['MANAGE_SCORES'],
      })
      .expect(201);

    await authAsMember(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${someMatch.id}/score`,
      ),
    )
      .send({ homeScore: 1, awayScore: 0 })
      .expect(200);
  });
});
