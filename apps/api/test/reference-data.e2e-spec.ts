import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

describe('Reference data (e2e)', () => {
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

  it('rejects unauthenticated access to /permissions', async () => {
    await request(app.getHttpServer()).get('/api/v1/permissions').expect(401);
  });

  // Public (feat/045): the landing page's "Sports" nav dropdown lists these
  // for a logged-out visitor -- see sports.controller.ts.
  it('allows unauthenticated access to /sports', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sports')
      .expect(200);
    const sports = res.body as { id: string; name: string }[];
    expect(sports.length).toBeGreaterThan(0);
    expect(sports.map((sport) => sport.name)).toContain('Football');
  });

  it('lists the seeded sports and permissions for an authenticated user', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'organizer@example.com',
        password: 'a-very-strong-password',
        firstName: 'Ada',
        lastName: 'Lovelace',
        organizationName: 'Ada Tournaments',
      })
      .expect(201);
    const accessToken = (registerRes.body as { accessToken: string })
      .accessToken;

    const sportsRes = await request(app.getHttpServer())
      .get('/api/v1/sports')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const sports = sportsRes.body as { id: string; name: string }[];
    expect(sports.length).toBeGreaterThan(0);
    expect(sports.map((sport) => sport.name)).toContain('Football');

    const permissionsRes = await request(app.getHttpServer())
      .get('/api/v1/permissions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const permissions = permissionsRes.body as { key: string; label: string }[];
    expect(permissions.map((permission) => permission.key)).toContain(
      'MANAGE_SCORES',
    );
  });
});
