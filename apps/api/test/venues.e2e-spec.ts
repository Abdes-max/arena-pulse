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

interface VenueResponseBody {
  id: string;
  name: string;
  address: string | null;
  fields: { id: string; name: string }[];
}

async function registerOrganizer(app: INestApplication<App>) {
  const email = 'organizer@example.com';
  const password = 'a-very-strong-password';
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: 'Ada Tournaments',
    })
    .expect(201);
  // register() no longer issues a session -- mark the test account verified
  // directly in DB (bypassing the email link) and log in for real tokens,
  // mirroring what a real user does after clicking the verification link.
  await app
    .get(PrismaService)
    .user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const { accessToken } = loginRes.body as AuthResponseBody;
  const meRes = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  const { organizations } = meRes.body as { organizations: { id: string }[] };
  return { accessToken, organizationId: organizations[0].id };
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
      emailVerifiedAt: new Date(),
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

describe('Venues, fields and time slots (e2e)', () => {
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

  it('manages venues, fields and time slots end to end, rejecting writes on an archived tournament', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const venuesBase = `${base}/${tournamentId}/venues`;

    const venueRes = await auth(request(app.getHttpServer()).post(venuesBase))
      .send({ name: 'Stade Marius Requier', address: 'Aix-en-Provence' })
      .expect(201);
    const venue = venueRes.body as VenueResponseBody;
    expect(venue.fields).toEqual([]);

    await auth(request(app.getHttpServer()).post(venuesBase))
      .send({ name: 'Stade Marius Requier' })
      .expect(409);

    const fieldRes = await auth(
      request(app.getHttpServer()).post(`${venuesBase}/${venue.id}/fields`),
    )
      .send({ name: 'Pelouse 1', surface: 'gazon' })
      .expect(201);
    const fieldId = (fieldRes.body as { id: string }).id;

    const slotRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/fields/${fieldId}/timeslots`,
      ),
    )
      .send({
        startTime: '2026-05-01T10:00:00.000Z',
        endTime: '2026-05-01T11:00:00.000Z',
      })
      .expect(201);
    const slotId = (slotRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/fields/${fieldId}/timeslots`,
      ),
    )
      .send({
        startTime: '2026-05-01T12:00:00.000Z',
        endTime: '2026-05-01T11:00:00.000Z',
      })
      .expect(400);

    const listVenuesRes = await auth(
      request(app.getHttpServer()).get(venuesBase),
    ).expect(200);
    expect((listVenuesRes.body as VenueResponseBody[])[0].fields).toHaveLength(
      1,
    );

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/archive`),
    ).expect(200);
    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/timeslots/${slotId}`,
      ),
    )
      .send({ label: 'Pause' })
      .expect(409);

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/unarchive`),
    ).expect(200);
    await auth(
      request(app.getHttpServer()).delete(
        `${base}/${tournamentId}/timeslots/${slotId}`,
      ),
    ).expect(204);
    await auth(
      request(app.getHttpServer()).delete(
        `${base}/${tournamentId}/fields/${fieldId}`,
      ),
    ).expect(204);
    await auth(
      request(app.getHttpServer()).delete(`${venuesBase}/${venue.id}`),
    ).expect(204);
  });

  it('rejects a venue whose venueId belongs to another tournament', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentARes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe A', sportId })
      .expect(201);
    const tournamentAId = (tournamentARes.body as { id: string }).id;
    const venueRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentAId}/venues`),
    )
      .send({ name: 'Stade' })
      .expect(201);
    const venueId = (venueRes.body as { id: string }).id;

    const tournamentBRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe B', sportId })
      .expect(201);
    const tournamentBId = (tournamentBRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentBId}/venues/${venueId}`,
      ),
    )
      .send({ name: 'X' })
      .expect(404);
  });

  it('gates venue writes behind MANAGE_GENERAL and field writes behind MANAGE_SCHEDULE', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

    const member = await addOrganizationMember(
      app,
      organizationId,
      'member@example.com',
      'a-very-strong-password',
    );
    const authAsMember = (req: request.Test) =>
      req.set('Authorization', `Bearer ${member.accessToken}`);

    await authAsMember(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/venues`),
    )
      .send({ name: 'Stade' })
      .expect(403);

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/administrators`,
      ),
    )
      .send({ email: 'member@example.com', permissionKeys: ['MANAGE_GENERAL'] })
      .expect(201);

    const venueRes = await authAsMember(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/venues`),
    )
      .send({ name: 'Stade' })
      .expect(201);
    const venueId = (venueRes.body as { id: string }).id;

    // MANAGE_GENERAL alone isn't enough to manage fields — that needs MANAGE_SCHEDULE.
    await authAsMember(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/venues/${venueId}/fields`,
      ),
    )
      .send({ name: 'Pelouse 1' })
      .expect(403);

    const administratorsRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/administrators`,
      ),
    ).expect(200);
    const administrator = (
      administratorsRes.body as { id: string; email: string }[]
    ).find((a) => a.email === 'member@example.com')!;
    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/administrators/${administrator.id}`,
      ),
    )
      .send({ permissionKeys: ['MANAGE_GENERAL', 'MANAGE_SCHEDULE'] })
      .expect(200);

    await authAsMember(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/venues/${venueId}/fields`,
      ),
    )
      .send({ name: 'Pelouse 1' })
      .expect(201);
  });
});
