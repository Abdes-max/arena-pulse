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

interface PlayerResponseBody {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  isCaptain: boolean;
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

describe('Players (e2e)', () => {
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

  it('adds, lists, updates and removes a player from a team', async () => {
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
    const teamRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
    )
      .send({ name: 'Les Aigles', categoryId })
      .expect(201);
    const teamId = (teamRes.body as { id: string }).id;
    const playersBase = `${base}/${tournamentId}/teams/${teamId}/players`;

    const createRes = await auth(request(app.getHttpServer()).post(playersBase))
      .send({
        firstName: 'Ada',
        lastName: 'Lovelace',
        jerseyNumber: 10,
        isCaptain: true,
      })
      .expect(201);
    const player = createRes.body as PlayerResponseBody;
    expect(player.isCaptain).toBe(true);

    const listRes = await auth(
      request(app.getHttpServer()).get(playersBase),
    ).expect(200);
    expect((listRes.body as PlayerResponseBody[]).map((p) => p.id)).toContain(
      player.id,
    );

    const updateRes = await auth(
      request(app.getHttpServer()).patch(`${playersBase}/${player.id}`),
    )
      .send({ jerseyNumber: 7 })
      .expect(200);
    expect((updateRes.body as PlayerResponseBody).jerseyNumber).toBe(7);

    await auth(
      request(app.getHttpServer()).delete(`${playersBase}/${player.id}`),
    ).expect(204);
    const listAfterRemoveRes = await auth(
      request(app.getHttpServer()).get(playersBase),
    ).expect(200);
    expect(listAfterRemoveRes.body).toEqual([]);
  });

  it('rejects a player whose id belongs to another team', async () => {
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
    const team1Res = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
    )
      .send({ name: 'Les Aigles', categoryId })
      .expect(201);
    const team1Id = (team1Res.body as { id: string }).id;
    const team2Res = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
    )
      .send({ name: 'Les Lions', categoryId })
      .expect(201);
    const team2Id = (team2Res.body as { id: string }).id;

    const playerRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/teams/${team1Id}/players`,
      ),
    )
      .send({ firstName: 'Ada', lastName: 'Lovelace' })
      .expect(201);
    const playerId = (playerRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/teams/${team2Id}/players/${playerId}`,
      ),
    )
      .send({ firstName: 'X' })
      .expect(404);
  });
});
