import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrganizationRole } from '../generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

interface AdministratorResponseBody {
  id: string;
  userId: string;
  email: string;
  permissionKeys: string[];
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

/** Directly seeds an org member, bypassing the invitation/email flow this test doesn't care about. */
async function addOrganizationMember(
  prisma: PrismaService,
  organizationId: string,
  email: string,
) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'irrelevant-for-this-test',
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
  return user;
}

describe('Tournament administrators (e2e)', () => {
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

  it('adds, updates and removes a tournament administrator', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const referee = await addOrganizationMember(
      prisma,
      organizationId,
      'referee@example.com',
    );
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);

    const sportsRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportsRes.body as { id: string }[])[0].id;
    const tournamentRes = await auth(
      request(app.getHttpServer()).post(
        `/api/v1/organizations/${organizationId}/tournaments`,
      ),
    )
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const base = `/api/v1/organizations/${organizationId}/tournaments/${tournamentId}/administrators`;

    const addRes = await auth(request(app.getHttpServer()).post(base))
      .send({ email: 'referee@example.com', permissionKeys: ['MANAGE_SCORES'] })
      .expect(201);
    const administrator = addRes.body as AdministratorResponseBody;
    expect(administrator.userId).toBe(referee.id);
    expect(administrator.permissionKeys).toEqual(['MANAGE_SCORES']);

    await auth(request(app.getHttpServer()).post(base))
      .send({ email: 'referee@example.com', permissionKeys: [] })
      .expect(409);

    const listRes = await auth(request(app.getHttpServer()).get(base)).expect(
      200,
    );
    expect(
      (listRes.body as AdministratorResponseBody[]).map((a) => a.email),
    ).toContain('referee@example.com');

    const updateRes = await auth(
      request(app.getHttpServer()).patch(`${base}/${administrator.id}`),
    )
      .send({ permissionKeys: ['MANAGE_GENERAL', 'MANAGE_SCORES'] })
      .expect(200);
    expect(
      (updateRes.body as AdministratorResponseBody).permissionKeys.sort(),
    ).toEqual(['MANAGE_GENERAL', 'MANAGE_SCORES']);

    await auth(
      request(app.getHttpServer()).delete(`${base}/${administrator.id}`),
    ).expect(204);
    const listAfterRemoveRes = await auth(
      request(app.getHttpServer()).get(base),
    ).expect(200);
    expect(listAfterRemoveRes.body).toEqual([]);
  });

  it('rejects adding someone who is not a member of the organization', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);

    const sportsRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportsRes.body as { id: string }[])[0].id;
    const tournamentRes = await auth(
      request(app.getHttpServer()).post(
        `/api/v1/organizations/${organizationId}/tournaments`,
      ),
    )
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(
        `/api/v1/organizations/${organizationId}/tournaments/${tournamentId}/administrators`,
      ),
    )
      .send({ email: 'not-a-member@example.com', permissionKeys: [] })
      .expect(404);
  });
});
