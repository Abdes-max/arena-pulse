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

interface RefereeResponseBody {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
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

describe('Referees (e2e)', () => {
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

  it('adds, lists, updates and removes a referee, and toggles teamsCanReferee on the tournament', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    expect(
      (tournamentRes.body as { teamsCanReferee?: boolean }).teamsCanReferee,
    ).toBe(false);
    const refereesBase = `${base}/${tournamentId}/referees`;

    const createRes = await auth(
      request(app.getHttpServer()).post(refereesBase),
    )
      .send({ firstName: 'Rui', lastName: 'Referee', email: 'rui@example.com' })
      .expect(201);
    const referee = createRes.body as RefereeResponseBody;
    expect(referee.email).toBe('rui@example.com');

    const listRes = await auth(
      request(app.getHttpServer()).get(refereesBase),
    ).expect(200);
    expect((listRes.body as RefereeResponseBody[]).map((r) => r.id)).toContain(
      referee.id,
    );

    const updateRes = await auth(
      request(app.getHttpServer()).patch(`${refereesBase}/${referee.id}`),
    )
      .send({ phone: '0102030405' })
      .expect(200);
    expect((updateRes.body as RefereeResponseBody).phone).toBe('0102030405');

    const toggleRes = await auth(
      request(app.getHttpServer()).patch(`${base}/${tournamentId}`),
    )
      .send({ teamsCanReferee: true })
      .expect(200);
    expect(
      (toggleRes.body as { teamsCanReferee: boolean }).teamsCanReferee,
    ).toBe(true);

    await auth(
      request(app.getHttpServer()).delete(`${refereesBase}/${referee.id}`),
    ).expect(204);
    const listAfterRemoveRes = await auth(
      request(app.getHttpServer()).get(refereesBase),
    ).expect(200);
    expect(listAfterRemoveRes.body).toEqual([]);
  });

  it('rejects writes on referees when the tournament is archived', async () => {
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
      request(app.getHttpServer()).post(`${base}/${tournamentId}/archive`),
    ).expect(200);
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/referees`),
    )
      .send({ firstName: 'Rui', lastName: 'Referee' })
      .expect(409);
  });
});
