import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PasswordService } from '../src/auth/password.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface SuperAdminAuthResponseBody {
  accessToken: string;
  superAdmin: { id: string; email: string };
}

function extractRefreshCookie(res: request.Response): string {
  const raw = res.get('Set-Cookie');
  const cookie = raw?.find((c) => c.startsWith('super_admin_refresh_token='));
  if (!cookie) {
    throw new Error('No super_admin_refresh_token cookie in response');
  }
  return cookie.split(';')[0];
}

describe('Super admin auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const credentials = {
    email: 'superadmin@example.com',
    password: 'a-very-strong-password',
  };

  /** SuperAdminAccount has no HTTP registration path -- inserted directly, exactly like the real create-super-admin.ts script does. */
  async function createSuperAdmin(): Promise<void> {
    const passwordService = app.get(PasswordService);
    await prisma.superAdminAccount.create({
      data: {
        email: credentials.email,
        passwordHash: await passwordService.hash(credentials.password),
        firstName: 'Super',
        lastName: 'Admin',
      },
    });
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

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await createSuperAdmin();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/login')
      .send(credentials)
      .expect(200);
    const loginBody = loginRes.body as SuperAdminAuthResponseBody;
    expect(loginBody.accessToken).toEqual(expect.any(String));
    expect(loginBody.superAdmin.email).toBe(credentials.email);
    expect(extractRefreshCookie(loginRes)).toContain('super_admin_refresh_token=');

    await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/login')
      .send({ email: credentials.email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects /super-admin-auth/me without a token and accepts it with one', async () => {
    await createSuperAdmin();
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/login')
      .send(credentials)
      .expect(200);
    const { accessToken } = loginRes.body as SuperAdminAuthResponseBody;

    await request(app.getHttpServer()).get('/api/v1/super-admin-auth/me').expect(401);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/super-admin-auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((meRes.body as { email: string }).email).toBe(credentials.email);
  });

  it('rotates the refresh token and rejects reuse of the old one', async () => {
    await createSuperAdmin();
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/login')
      .send(credentials)
      .expect(200);
    const firstCookie = extractRefreshCookie(loginRes);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = extractRefreshCookie(refreshRes);
    expect(secondCookie).not.toBe(firstCookie);

    await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);

    // Reuse of a revoked token revokes the whole family: even the latest one stops working.
    await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });

  it('logs out and invalidates the refresh token', async () => {
    await createSuperAdmin();
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/login')
      .send(credentials)
      .expect(200);
    const cookie = extractRefreshCookie(loginRes);

    await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  // The most critical test in this whole feature: three account types
  // (organizer, player, super admin) share one JWT_SECRET, disambiguated
  // only by the `type` claim -- a bug here would mean an ordinary
  // organizer account could read/manage every organization on the
  // platform.
  it('rejects an organizer token on super-admin routes, and a super-admin token on organizer routes', async () => {
    await createSuperAdmin();
    const superAdminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/login')
      .send(credentials)
      .expect(200);
    const superAdminToken = (superAdminLoginRes.body as SuperAdminAuthResponseBody).accessToken;

    const organizerEmail = 'organizer@example.com';
    const organizerPassword = 'a-very-strong-password';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: organizerEmail,
        password: organizerPassword,
        firstName: 'Ada',
        lastName: 'Lovelace',
        organizationName: 'Ada Tournaments',
      })
      .expect(201);
    await prisma.user.update({
      where: { email: organizerEmail },
      data: { emailVerifiedAt: new Date() },
    });
    const organizerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: organizerEmail, password: organizerPassword })
      .expect(200);
    const organizerToken = (organizerLoginRes.body as { accessToken: string }).accessToken;

    // An organizer's access token must not unlock a super-admin-only route...
    await request(app.getHttpServer())
      .get('/api/v1/super-admin-auth/me')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/super-admin/stats')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(401);

    // ...and a super-admin's access token must not unlock an organizer-only route.
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(401);
  });
});
