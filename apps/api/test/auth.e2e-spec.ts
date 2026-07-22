import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  user: { email: string };
  organization?: { role: string };
}

interface MeResponseBody {
  email: string;
  organizations: unknown[];
}

function extractRefreshCookie(res: request.Response): string {
  const raw = res.get('Set-Cookie');
  const cookie = raw?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) {
    throw new Error('No refresh_token cookie in response');
  }
  return cookie.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const credentials = {
    email: 'organizer@example.com',
    password: 'a-very-strong-password',
    firstName: 'Ada',
    lastName: 'Lovelace',
    organizationName: 'Ada Tournaments',
  };

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('registers a new user with their own organization as ORG_ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    const body = res.body as AuthResponseBody;

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user.email).toBe(credentials.email);
    expect(body.organization?.role).toBe('ORG_ADMIN');
    expect(extractRefreshCookie(res)).toContain('refresh_token=');
  });

  it('rejects registration with an email that already has an account', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(409);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects /auth/me without a token and accepts it with one', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    const registerBody = registerRes.body as AuthResponseBody;

    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registerBody.accessToken}`)
      .expect(200);
    const meBody = meRes.body as MeResponseBody;

    expect(meBody.email).toBe(credentials.email);
    expect(meBody.organizations).toHaveLength(1);
  });

  it('rotates the refresh token and rejects reuse of the old one', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    const firstCookie = extractRefreshCookie(registerRes);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = extractRefreshCookie(refreshRes);
    expect(secondCookie).not.toBe(firstCookie);

    // The rotated-out cookie must now be rejected.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);

    // Reuse of a revoked token revokes the whole family: even the latest one stops working.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });

  it('logs out and invalidates the refresh token', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    const cookie = extractRefreshCookie(registerRes);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });
});
