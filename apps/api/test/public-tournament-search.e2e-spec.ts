import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
}

describe('Public tournament directory search (e2e)', () => {
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

  // Registers one organizer, publishes one tournament for them with the
  // given fields, and returns everything a filter test might need.
  async function registerAndPublishTournament(
    organizerEmail: string,
    organizationName: string,
    tournamentFields: {
      name: string;
      sportId: string;
      startDate?: string;
      venue?: { name: string; address: string };
    },
  ) {
    const password = 'a-very-strong-password';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: organizerEmail,
        password,
        firstName: 'Ada',
        lastName: 'Lovelace',
        organizationName,
      })
      .expect(201);
    await prisma.user.update({
      where: { email: organizerEmail },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: organizerEmail, password })
      .expect(200);
    const { accessToken } = loginRes.body as AuthResponseBody;
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const organizationId = (meRes.body as { organizations: { id: string }[] })
      .organizations[0].id;
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({
        name: tournamentFields.name,
        sportId: tournamentFields.sportId,
        startDate: tournamentFields.startDate,
      })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const slug = (tournamentRes.body as { slug: string }).slug;

    if (tournamentFields.venue) {
      const venueRes = await auth(
        request(app.getHttpServer()).post(`${base}/${tournamentId}/venues`),
      )
        .send(tournamentFields.venue)
        .expect(201);
      const venueId = (venueRes.body as { id: string }).id;
      await auth(
        request(app.getHttpServer()).post(
          `${base}/${tournamentId}/venues/${venueId}/fields`,
        ),
      )
        .send({ name: 'Terrain 1' })
        .expect(201);
    }

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);

    return { organizationId, organizationName, tournamentId, slug };
  }

  it('lists every listed+published tournament with its organizer name and a total count', async () => {
    const sportRes = await request(app.getHttpServer())
      .get('/api/v1/sports')
      .expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    const a = await registerAndPublishTournament(
      'ada@example.com',
      'Ada Tournaments',
      { name: 'Coupe A', sportId },
    );
    const b = await registerAndPublishTournament(
      'grace@example.com',
      'Grace Tournaments',
      { name: 'Coupe B', sportId },
    );

    const res = await request(app.getHttpServer())
      .get('/api/v1/public/tournaments/search')
      .expect(200);
    const body = res.body as {
      items: Record<string, unknown>[];
      total: number;
    };
    expect(body.total).toBe(2);
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: a.slug,
          organizerName: a.organizationName,
        }),
        expect.objectContaining({
          slug: b.slug,
          organizerName: b.organizationName,
        }),
      ]),
    );
  });

  it('filters by name, sport, location and start date, each independently', async () => {
    const sportsRes = await request(app.getHttpServer())
      .get('/api/v1/sports')
      .expect(200);
    const sports = sportsRes.body as { id: string; name: string }[];
    const [sportOne, sportTwo] = sports;

    const near = await registerAndPublishTournament(
      'near@example.com',
      'Near Org',
      {
        name: 'Coupe de Printemps',
        sportId: sportOne.id,
        startDate: '2027-03-01T00:00:00.000Z',
        venue: { name: 'Stade de Vancouver', address: '1 rue du Stade' },
      },
    );
    const far = await registerAndPublishTournament(
      'far@example.com',
      'Far Org',
      {
        name: 'Coupe Automnale',
        sportId: sportTwo.id,
        startDate: '2027-11-01T00:00:00.000Z',
        venue: { name: 'Gymnase de Lyon', address: '2 avenue du Sport' },
      },
    );

    const search = (query: string) =>
      request(app.getHttpServer())
        .get(`/api/v1/public/tournaments/search?${query}`)
        .expect(200)
        .then((res) =>
          (res.body as { items: { slug: string }[] }).items.map((i) => i.slug),
        );

    await expect(search('q=Printemps')).resolves.toEqual([near.slug]);
    await expect(search(`sportId=${sportTwo.id}`)).resolves.toEqual([far.slug]);
    await expect(search('location=Vancouver')).resolves.toEqual([near.slug]);
    await expect(search('dateFrom=2027-06-01')).resolves.toEqual([far.slug]);
  });

  it('paginates with page/pageSize', async () => {
    const sportRes = await request(app.getHttpServer())
      .get('/api/v1/sports')
      .expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    await registerAndPublishTournament('one@example.com', 'Org One', {
      name: 'Coupe Un',
      sportId,
    });
    await registerAndPublishTournament('two@example.com', 'Org Two', {
      name: 'Coupe Deux',
      sportId,
    });

    const page1 = await request(app.getHttpServer())
      .get('/api/v1/public/tournaments/search?pageSize=1&page=1')
      .expect(200);
    const page2 = await request(app.getHttpServer())
      .get('/api/v1/public/tournaments/search?pageSize=1&page=2')
      .expect(200);
    const body1 = page1.body as { items: unknown[]; total: number };
    const body2 = page2.body as { items: unknown[]; total: number };
    expect(body1.items).toHaveLength(1);
    expect(body2.items).toHaveLength(1);
    expect(body1.total).toBe(2);
    expect(body2.total).toBe(2);
    expect(body1.items).not.toEqual(body2.items);
  });
});
