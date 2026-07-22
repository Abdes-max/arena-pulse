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

interface TournamentResponseBody {
  id: string;
  name: string;
  status: string;
  sportId: string;
  sportName: string;
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
  const sports = res.body as { id: string; name: string }[];
  return sports[0].id;
}

describe('Tournaments (e2e)', () => {
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

  it('supports the full lifecycle: create, list, edit, publish/unpublish, archive, unarchive', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const createRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe de printemps', sportId })
      .expect(201);
    const tournament = createRes.body as TournamentResponseBody;
    expect(tournament.status).toBe('DRAFT');
    expect(tournament.sportName).toBeTruthy();

    const listRes = await auth(request(app.getHttpServer()).get(base)).expect(
      200,
    );
    expect(
      (listRes.body as TournamentResponseBody[]).map((t) => t.id),
    ).toContain(tournament.id);

    await auth(request(app.getHttpServer()).patch(`${base}/${tournament.id}`))
      .send({ name: 'Coupe de printemps (2026)' })
      .expect(200);

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournament.id}/publish`),
    ).expect(200);
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournament.id}/publish`),
    ).expect(409);
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournament.id}/unpublish`),
    ).expect(200);

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournament.id}/archive`),
    ).expect(200);

    // Archived tournaments are read-only server-side, not just in the UI.
    await auth(request(app.getHttpServer()).patch(`${base}/${tournament.id}`))
      .send({ name: 'Interdit' })
      .expect(409);
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournament.id}/publish`),
    ).expect(409);

    const unarchiveRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournament.id}/unarchive`),
    ).expect(200);
    expect((unarchiveRes.body as TournamentResponseBody).status).toBe('DRAFT');
  });

  it('duplicates an archived tournament as a fresh DRAFT clone', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const createRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Édition 2025', sportId })
      .expect(201);
    const tournament = createRes.body as TournamentResponseBody;

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournament.id}/archive`),
    ).expect(200);

    const duplicateRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournament.id}/duplicate`),
    )
      .send({})
      .expect(201);
    const clone = duplicateRes.body as TournamentResponseBody;
    expect(clone.name).toBe('Édition 2025 (copie)');
    expect(clone.status).toBe('DRAFT');
    expect(clone.id).not.toBe(tournament.id);
  });

  it('isolates tournaments between organizations', async () => {
    const orgA = await registerOrganizer(app, {
      email: 'a@example.com',
      organizationName: 'Org A',
    });
    const orgB = await registerOrganizer(app, {
      email: 'b@example.com',
      organizationName: 'Org B',
    });
    const sportId = await firstSportId(app, orgA.accessToken);

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgA.organizationId}/tournaments`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ name: 'Tournoi privé', sportId })
      .expect(201);
    const tournament = createRes.body as TournamentResponseBody;

    // orgB's admin is a legitimate member of orgB (guard passes), but the
    // tournament belongs to orgA — 404, not 403, so as not to leak whether a
    // given tournament id exists at all outside the caller's organization.
    await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/${orgB.organizationId}/tournaments/${tournament.id}`,
      )
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(404);
  });
});
