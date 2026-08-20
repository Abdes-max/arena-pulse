import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PasswordService } from '../src/auth/password.service';
import { OrganizationRole } from '../generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
}

interface SuperAdminAuthResponseBody {
  accessToken: string;
}

const PASSWORD = 'a-very-strong-password';
const SUPER_ADMIN_CREDENTIALS = {
  email: 'superadmin@example.com',
  password: 'a-very-strong-password',
};

async function registerOrganizer(
  app: INestApplication<App>,
  overrides: Partial<{ email: string; organizationName: string }> = {},
) {
  const email = overrides.email ?? 'organizer@example.com';
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email,
      password: PASSWORD,
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: overrides.organizationName ?? 'Ada Tournaments',
    })
    .expect(201);
  await app
    .get(PrismaService)
    .user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  const { accessToken } = loginRes.body as AuthResponseBody;
  const meRes = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  const { organizations } = meRes.body as { organizations: { id: string }[] };
  return { accessToken, email, organizationId: organizations[0].id };
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

async function createTournamentWithTeamAndPlayer(
  app: INestApplication<App>,
  accessToken: string,
  organizationId: string,
) {
  const sportId = await firstSportId(app, accessToken);
  const auth = (req: request.Test) =>
    req.set('Authorization', `Bearer ${accessToken}`);
  const base = `/api/v1/organizations/${organizationId}/tournaments`;

  const tournamentRes = await auth(request(app.getHttpServer()).post(base))
    .send({ name: 'Coupe du Monde', sportId })
    .expect(201);
  const tournamentId = (tournamentRes.body as { id: string }).id;
  const categoryRes = await auth(
    request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
  )
    .send({ name: 'U10' })
    .expect(201);
  const categoryId = (categoryRes.body as { id: string }).id;
  const teamsBase = `${base}/${tournamentId}/teams`;
  const teamRes = await auth(request(app.getHttpServer()).post(teamsBase))
    .send({ name: 'Les Copains', categoryId })
    .expect(201);
  const teamId = (teamRes.body as { id: string }).id;
  const playerRes = await auth(
    request(app.getHttpServer()).post(`${teamsBase}/${teamId}/players`),
  )
    .send({ firstName: 'Ada', lastName: 'Lovelace' })
    .expect(201);
  const playerId = (playerRes.body as { id: string }).id;

  return { tournamentId, teamId, playerId };
}

describe('Super-admin deletions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  async function createSuperAdminAndLogin(): Promise<string> {
    const passwordService = app.get(PasswordService);
    await prisma.superAdminAccount.create({
      data: {
        email: SUPER_ADMIN_CREDENTIALS.email,
        passwordHash: await passwordService.hash(
          SUPER_ADMIN_CREDENTIALS.password,
        ),
        firstName: 'Super',
        lastName: 'Admin',
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/login')
      .send(SUPER_ADMIN_CREDENTIALS)
      .expect(200);
    return (loginRes.body as SuperAdminAuthResponseBody).accessToken;
  }

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('rejects an invalid confirmation on every delete route', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { organizationId } = await registerOrganizer(app);

    await request(app.getHttpServer())
      .delete(`/api/v1/super-admin/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ confirmation: 'nope' })
      .expect(400);
  });

  it('deletes an organization and cascades its tournaments/teams/players', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { accessToken, organizationId } = await registerOrganizer(app);
    const { tournamentId, teamId } = await createTournamentWithTeamAndPlayer(
      app,
      accessToken,
      organizationId,
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/super-admin/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ confirmation: 'SUPPRIMER' })
      .expect(204);

    expect(
      await prisma.organization.findUnique({ where: { id: organizationId } }),
    ).toBeNull();
    expect(
      await prisma.tournament.findUnique({ where: { id: tournamentId } }),
    ).toBeNull();
    expect(await prisma.team.findUnique({ where: { id: teamId } })).toBeNull();
  });

  it('deletes a sole-member organizer account and cascades their organization', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { email, organizationId } = await registerOrganizer(app);
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email } }))
      .id;

    await request(app.getHttpServer())
      .delete(`/api/v1/super-admin/users/${userId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ confirmation: 'SUPPRIMER' })
      .expect(204);

    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(
      await prisma.organization.findUnique({ where: { id: organizationId } }),
    ).toBeNull();
  });

  it('blocks deleting an organizer account that is the last admin of a multi-member organization', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { email, organizationId } = await registerOrganizer(app, {
      email: 'admin@example.com',
    });
    const passwordService = app.get(PasswordService);
    const collaborator = await prisma.user.create({
      data: {
        email: 'collaborator@example.com',
        passwordHash: await passwordService.hash(PASSWORD),
        firstName: 'Coco',
        lastName: 'Laborator',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId,
        userId: collaborator.id,
        role: OrganizationRole.ORG_MEMBER,
      },
    });
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email } }))
      .id;

    await request(app.getHttpServer())
      .delete(`/api/v1/super-admin/users/${userId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ confirmation: 'SUPPRIMER' })
      .expect(409);
    expect(
      await prisma.user.findUnique({ where: { id: userId } }),
    ).not.toBeNull();
  });

  it('deletes a tournament and cascades its teams/players', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { accessToken, organizationId } = await registerOrganizer(app);
    const { tournamentId, teamId, playerId } =
      await createTournamentWithTeamAndPlayer(app, accessToken, organizationId);

    await request(app.getHttpServer())
      .delete(`/api/v1/super-admin/tournaments/${tournamentId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ confirmation: 'SUPPRIMER' })
      .expect(204);

    expect(
      await prisma.tournament.findUnique({ where: { id: tournamentId } }),
    ).toBeNull();
    expect(await prisma.team.findUnique({ where: { id: teamId } })).toBeNull();
    expect(
      await prisma.player.findUnique({ where: { id: playerId } }),
    ).toBeNull();
  });

  it('deletes a team and cascades its players', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { accessToken, organizationId } = await registerOrganizer(app);
    const { tournamentId, teamId, playerId } =
      await createTournamentWithTeamAndPlayer(app, accessToken, organizationId);

    await request(app.getHttpServer())
      .delete(`/api/v1/super-admin/tournaments/${tournamentId}/teams/${teamId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ confirmation: 'SUPPRIMER' })
      .expect(204);

    expect(await prisma.team.findUnique({ where: { id: teamId } })).toBeNull();
    expect(
      await prisma.player.findUnique({ where: { id: playerId } }),
    ).toBeNull();
  });

  it('deletes a player', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { accessToken, organizationId } = await registerOrganizer(app);
    const { tournamentId, teamId, playerId } =
      await createTournamentWithTeamAndPlayer(app, accessToken, organizationId);

    await request(app.getHttpServer())
      .delete(
        `/api/v1/super-admin/tournaments/${tournamentId}/teams/${teamId}/players/${playerId}`,
      )
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ confirmation: 'SUPPRIMER' })
      .expect(204);

    expect(
      await prisma.player.findUnique({ where: { id: playerId } }),
    ).toBeNull();
    // The team itself must survive -- only the player was targeted.
    expect(
      await prisma.team.findUnique({ where: { id: teamId } }),
    ).not.toBeNull();
  });
});
