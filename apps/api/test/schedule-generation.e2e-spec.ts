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
