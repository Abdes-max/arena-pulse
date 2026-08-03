import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface PlayerAuthResponseBody {
  accessToken: string;
  playerAccount: { id: string; email: string };
}

interface OrganizerAuthResponseBody {
  accessToken: string;
}

function extractRefreshCookie(res: request.Response): string {
  const raw = res.get('Set-Cookie');
  const cookie = raw?.find((c) => c.startsWith('player_refresh_token='));
  if (!cookie) {
    throw new Error('No player_refresh_token cookie in response');
  }
  return cookie.split(';')[0];
}

describe('Player auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const credentials = {
    email: 'player@example.com',
    password: 'a-very-strong-password',
    firstName: 'Léa',
    lastName: 'Martin',
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

  it('registers a new player account', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/player-auth/register')
      .send(credentials)
      .expect(201);
    const body = res.body as PlayerAuthResponseBody;

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.playerAccount.email).toBe(credentials.email);
    expect(extractRefreshCookie(res)).toContain('player_refresh_token=');
  });

  it('rejects registration with an email that already has a player account', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/player-auth/register')
      .send(credentials)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/player-auth/register')
      .send(credentials)
      .expect(409);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/player-auth/register')
      .send(credentials)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/player-auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/player-auth/login')
      .send({ email: credentials.email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects /player-auth/me without a token and accepts it with one', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/player-auth/register')
      .send(credentials)
      .expect(201);
    const registerBody = registerRes.body as PlayerAuthResponseBody;

    await request(app.getHttpServer())
      .get('/api/v1/player-auth/me')
      .expect(401);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/player-auth/me')
      .set('Authorization', `Bearer ${registerBody.accessToken}`)
      .expect(200);

    expect((meRes.body as { email: string }).email).toBe(credentials.email);
  });

  it('rotates the refresh token and rejects reuse of the old one', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/player-auth/register')
      .send(credentials)
      .expect(201);
    const firstCookie = extractRefreshCookie(registerRes);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/player-auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = extractRefreshCookie(refreshRes);
    expect(secondCookie).not.toBe(firstCookie);

    await request(app.getHttpServer())
      .post('/api/v1/player-auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/player-auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });

  it('logs out and invalidates the refresh token', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/player-auth/register')
      .send(credentials)
      .expect(201);
    const cookie = extractRefreshCookie(registerRes);

    await request(app.getHttpServer())
      .post('/api/v1/player-auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/player-auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('keeps organizer and player sessions from crossing over', async () => {
    const playerRes = await request(app.getHttpServer())
      .post('/api/v1/player-auth/register')
      .send(credentials)
      .expect(201);
    const playerToken = (playerRes.body as PlayerAuthResponseBody).accessToken;

    const organizerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'organizer@example.com',
        password: 'a-very-strong-password',
        firstName: 'Ada',
        lastName: 'Lovelace',
        organizationName: 'Ada Tournaments',
      })
      .expect(201);
    const organizerToken = (organizerRes.body as OrganizerAuthResponseBody)
      .accessToken;

    // A player's access token must not unlock an organizer-only route...
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(401);

    // ...and an organizer's access token must not unlock a player-only route.
    await request(app.getHttpServer())
      .get('/api/v1/player-auth/me')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(401);
  });
});
