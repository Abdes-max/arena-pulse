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
  groupId: string;
  round: number;
  status: string;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  timeSlot: {
    id: string;
    startTime: string;
    endTime: string;
    field: { id: string; name: string };
  } | null;
  officials: {
    id: string;
    referee: { id: string } | null;
    refereeingTeam: { id: string } | null;
  }[];
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

describe('Schedule generation (e2e)', () => {
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

  async function setUpGroupOfFour(
    app: INestApplication<App>,
    auth: (req: request.Test) => request.Test,
    base: string,
    tournamentId: string,
    options: { doubleRoundRobin?: boolean } = {},
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
      .send({
        name: 'Phase de poules',
        type: 'GROUP_STAGE',
        doubleRoundRobin: options.doubleRoundRobin,
      })
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

    const fieldIds: string[] = [];
    for (const name of ['Terrain 1', 'Terrain 2']) {
      const fieldRes = await auth(
        request(app.getHttpServer()).post(
          `${base}/${tournamentId}/venues/${venueId}/fields`,
        ),
      )
        .send({ name })
        .expect(201);
      fieldIds.push((fieldRes.body as { id: string }).id);
    }

    return { categoryId, phaseId, groupId, fieldIds };
  }

  it('generates, lists and resets a round-robin schedule for a group-stage phase', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { phaseId, fieldIds } = await setUpGroupOfFour(
      app,
      auth,
      base,
      tournamentId,
    );

    const generateRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds, startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(201);
    const matches = generateRes.body as MatchResponseBody[];
    expect(matches).toHaveLength(6);
    expect(new Set(matches.map((m) => m.round))).toEqual(new Set([1, 2, 3]));
    expect(matches.every((m) => m.status === 'SCHEDULED')).toBe(true);
    expect(matches.every((m) => m.timeSlot !== null)).toBe(true);
    expect(new Set(matches.map((m) => m.timeSlot!.field.id))).toEqual(
      new Set(fieldIds),
    );

    const listRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/phases/${phaseId}/matches`,
      ),
    ).expect(200);
    expect(listRes.body as MatchResponseBody[]).toHaveLength(6);

    await auth(
      request(app.getHttpServer()).delete(
        `${base}/${tournamentId}/phases/${phaseId}/schedule`,
      ),
    ).expect(204);

    const afterResetRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/phases/${phaseId}/matches`,
      ),
    ).expect(200);
    expect(afterResetRes.body as MatchResponseBody[]).toHaveLength(0);
  });

  it('rejects a second generation while matches already exist, without resetting first', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { phaseId, fieldIds } = await setUpGroupOfFour(
      app,
      auth,
      base,
      tournamentId,
    );

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds, startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(201);

    // A second click without resetting must not silently double every match.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds, startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(409);

    const listRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/phases/${phaseId}/matches`,
      ),
    ).expect(200);
    expect(listRes.body as MatchResponseBody[]).toHaveLength(6);
  });

  it('doubles the fixtures with home/away swapped when the phase has doubleRoundRobin enabled', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { phaseId, fieldIds } = await setUpGroupOfFour(
      app,
      auth,
      base,
      tournamentId,
      { doubleRoundRobin: true },
    );

    const generateRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds, startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(201);
    const matches = generateRes.body as MatchResponseBody[];
    // 4 teams, single leg = 6 matches (3 rounds) -- doubled = 12 (6 rounds).
    expect(matches).toHaveLength(12);
    expect(new Set(matches.map((m) => m.round))).toEqual(
      new Set([1, 2, 3, 4, 5, 6]),
    );

    const pairKey = (homeId: string, awayId: string) =>
      [homeId, awayId].sort().join('-');
    const byPair = new Map<string, MatchResponseBody[]>();
    for (const match of matches) {
      const key = pairKey(match.homeTeam!.id, match.awayTeam!.id);
      byPair.set(key, [...(byPair.get(key) ?? []), match]);
    }
    // Every pair meets exactly twice, with home/away reversed the second time.
    for (const pair of byPair.values()) {
      expect(pair).toHaveLength(2);
      expect(pair[0].homeTeam!.id).toBe(pair[1].awayTeam!.id);
      expect(pair[0].awayTeam!.id).toBe(pair[1].homeTeam!.id);
    }
  });

  it("lists a KNOCKOUT phase's bracket matches via the phase-matches endpoint (not just via the bracket-matches endpoint)", async () => {
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

    // A "seeding" group-stage phase, same pattern as a pure-knockout
    // category: standings default to alphabetical order with no matches
    // played, which is enough to seed the bracket.
    const seedPhaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Engagés', type: 'GROUP_STAGE' })
      .expect(201);
    const seedPhaseId = (seedPhaseRes.body as { id: string }).id;

    const seedGroupRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${seedPhaseId}/groups`,
      ),
    )
      .send({ name: 'Engagés' })
      .expect(201);
    const seedGroupId = (seedGroupRes.body as { id: string }).id;

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
        .send({ groupId: seedGroupId })
        .expect(200);
    }

    const knockoutPhaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Tableau', type: 'KNOCKOUT' })
      .expect(201);
    const knockoutPhaseId = (knockoutPhaseRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/groups/${seedGroupId}/qualification-rules`,
      ),
    )
      .send({ fromPosition: 1, toPosition: 4, targetPhaseId: knockoutPhaseId })
      .expect(201);

    const bracketRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${knockoutPhaseId}/knockout-bracket`,
      ),
    )
      .send({ name: 'Tableau principal', size: 4 })
      .expect(201);
    const bracketId = (bracketRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/knockout-brackets/${bracketId}/generate-matches`,
      ),
    ).expect(201);

    // Before this fix, this returned [] for any KNOCKOUT phase -- matches
    // there live on a knockoutBracket, never on a group, and the query only
    // ever looked at `group: { phaseId }`.
    const listRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/phases/${knockoutPhaseId}/matches`,
      ),
    ).expect(200);
    // A size-4 bracket generates all rounds upfront: 2 round-1 matches with
    // real teams plus the round-2 (final) match as a null-team placeholder.
    const matches = listRes.body as MatchResponseBody[];
    expect(matches).toHaveLength(3);
    expect(matches.filter((match) => match.round === 2)).toEqual([
      expect.objectContaining({ homeTeam: null, awayTeam: null }),
    ]);
  });

  it('rejects generation for a phase belonging to another tournament', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentARes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe A', sportId })
      .expect(201);
    const tournamentAId = (tournamentARes.body as { id: string }).id;
    const { phaseId, fieldIds } = await setUpGroupOfFour(
      app,
      auth,
      base,
      tournamentAId,
    );

    const tournamentBRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe B', sportId })
      .expect(201);
    const tournamentBId = (tournamentBRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentBId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds, startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(404);
  });

  it('rejects generation when the tournament is archived', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { phaseId, fieldIds } = await setUpGroupOfFour(
      app,
      auth,
      base,
      tournamentId,
    );

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/archive`),
    ).expect(200);

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds, startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(409);
  });

  it('gates schedule generation behind MANAGE_SCHEDULE', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { phaseId, fieldIds } = await setUpGroupOfFour(
      app,
      auth,
      base,
      tournamentId,
    );

    const member = await addOrganizationMember(
      app,
      organizationId,
      'member@example.com',
      'a-very-strong-password',
    );
    const authAsMember = (req: request.Test) =>
      req.set('Authorization', `Bearer ${member.accessToken}`);

    await authAsMember(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds, startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(403);

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/administrators`,
      ),
    )
      .send({
        email: 'member@example.com',
        permissionKeys: ['MANAGE_SCHEDULE'],
      })
      .expect(201);

    await authAsMember(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds, startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(201);

    await auth(
      request(app.getHttpServer()).delete(
        `${base}/${tournamentId}/phases/${phaseId}/schedule`,
      ),
    ).expect(204);

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds, startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(201);
  });
});
