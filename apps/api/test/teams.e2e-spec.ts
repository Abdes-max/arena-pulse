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

interface TeamResponseBody {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  divisionId: string | null;
  divisionName: string | null;
}

async function registerOrganizer(
  app: INestApplication<App>,
  overrides: Partial<{ email: string; organizationName: string }> = {},
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email: overrides.email ?? 'organizer@example.com',
      password: 'a-very-strong-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: overrides.organizationName ?? 'Ada Tournaments',
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

/** Directly seeds an ORG_MEMBER with a real password, bypassing the invitation/email flow. */
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
  return {
    userId: user.id,
    accessToken: (loginRes.body as AuthResponseBody).accessToken,
  };
}

describe('Teams (e2e)', () => {
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

  it('creates, lists, updates and deletes a team, rejecting a duplicate name and writes on an archived tournament', async () => {
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
    const divisionRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/divisions`,
      ),
    )
      .send({ name: 'Poule A' })
      .expect(201);
    const divisionId = (divisionRes.body as { id: string }).id;
    const teamsBase = `${base}/${tournamentId}/teams`;

    const createRes = await auth(request(app.getHttpServer()).post(teamsBase))
      .send({ name: 'Les Aigles', categoryId, divisionId })
      .expect(201);
    const team = createRes.body as TeamResponseBody;
    expect(team.categoryName).toBe('U10');
    expect(team.divisionName).toBe('Poule A');

    await auth(request(app.getHttpServer()).post(teamsBase))
      .send({ name: 'Les Aigles', categoryId })
      .expect(409);

    const listRes = await auth(
      request(app.getHttpServer()).get(teamsBase),
    ).expect(200);
    expect((listRes.body as TeamResponseBody[]).map((t) => t.id)).toContain(
      team.id,
    );

    const updateRes = await auth(
      request(app.getHttpServer()).patch(`${teamsBase}/${team.id}`),
    )
      .send({ divisionId: '' })
      .expect(200);
    expect((updateRes.body as TeamResponseBody).divisionId).toBeNull();

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/archive`),
    ).expect(200);
    await auth(request(app.getHttpServer()).patch(`${teamsBase}/${team.id}`))
      .send({ name: 'Les Aigles (2)' })
      .expect(409);

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/unarchive`),
    ).expect(200);
    await auth(
      request(app.getHttpServer()).delete(`${teamsBase}/${team.id}`),
    ).expect(204);
    const listAfterRemoveRes = await auth(
      request(app.getHttpServer()).get(teamsBase),
    ).expect(200);
    expect(listAfterRemoveRes.body).toEqual([]);
  });

  it('rejects a team whose teamId belongs to another tournament', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentARes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe A', sportId })
      .expect(201);
    const tournamentAId = (tournamentARes.body as { id: string }).id;
    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentAId}/categories`),
    )
      .send({ name: 'U10' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;
    const teamRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentAId}/teams`),
    )
      .send({ name: 'Les Aigles', categoryId })
      .expect(201);
    const teamId = (teamRes.body as { id: string }).id;

    const tournamentBRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe B', sportId })
      .expect(201);
    const tournamentBId = (tournamentBRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentBId}/teams/${teamId}`,
      ),
    ).expect(404);
  });

  it('imports teams from CSV with partial success, and exports them back', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'U10' })
      .expect(201);
    const teamsBase = `${base}/${tournamentId}/teams`;

    const csv = 'nom;categorie;division\nLes Aigles;U10;\nLes Lions;Inconnue;';
    const importRes = await auth(
      request(app.getHttpServer()).post(`${teamsBase}/import`),
    )
      .send({ csv })
      .expect(201);
    const importBody = importRes.body as {
      created: TeamResponseBody[];
      errors: { line: number; message: string }[];
    };
    expect(importBody.created).toHaveLength(1);
    expect(importBody.errors).toEqual([
      { line: 3, message: 'Catégorie "Inconnue" introuvable.' },
    ]);

    const exportRes = await auth(
      request(app.getHttpServer()).get(`${teamsBase}/export`),
    ).expect(200);
    expect(exportRes.text).toBe('nom;categorie;division\r\nLes Aigles;U10;');
  });

  it('bulk deletes selected teams', async () => {
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
    const teamsBase = `${base}/${tournamentId}/teams`;
    const team1 = await auth(request(app.getHttpServer()).post(teamsBase))
      .send({ name: 'Les Aigles', categoryId })
      .expect(201);
    const team2 = await auth(request(app.getHttpServer()).post(teamsBase))
      .send({ name: 'Les Lions', categoryId })
      .expect(201);

    await auth(request(app.getHttpServer()).post(`${teamsBase}/bulk-delete`))
      .send({
        teamIds: [
          (team1.body as { id: string }).id,
          (team2.body as { id: string }).id,
        ],
      })
      .expect(204);

    const listRes = await auth(
      request(app.getHttpServer()).get(teamsBase),
    ).expect(200);
    expect(listRes.body).toEqual([]);
  });

  it('gates writes behind MANAGE_PARTICIPANTS: a bare ORG_MEMBER is rejected, an assigned TournamentAdministrator is allowed, ORG_ADMIN always allowed', async () => {
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
    const teamsBase = `${base}/${tournamentId}/teams`;

    const member = await addOrganizationMember(
      app,
      organizationId,
      'referee@example.com',
      'a-very-strong-password',
    );
    const authAsMember = (req: request.Test) =>
      req.set('Authorization', `Bearer ${member.accessToken}`);

    await authAsMember(request(app.getHttpServer()).post(teamsBase))
      .send({ name: 'Les Aigles', categoryId })
      .expect(403);

    const permissionsRes = await auth(
      request(app.getHttpServer()).get('/api/v1/permissions'),
    ).expect(200);
    const permissionKeys = (permissionsRes.body as { key: string }[]).map(
      (p) => p.key,
    );
    expect(permissionKeys).toContain('MANAGE_PARTICIPANTS');

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/administrators`,
      ),
    )
      .send({
        email: 'referee@example.com',
        permissionKeys: ['MANAGE_PARTICIPANTS'],
      })
      .expect(201);

    await authAsMember(request(app.getHttpServer()).post(teamsBase))
      .send({ name: 'Les Aigles', categoryId })
      .expect(201);

    await auth(request(app.getHttpServer()).post(teamsBase))
      .send({ name: 'Les Lions', categoryId })
      .expect(201);
  });
});
