import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface RegisterResponseBody {
  status: string;
  email: string;
}

interface AuthResponseBody {
  accessToken: string;
  user: { email: string };
}

interface MeResponseBody {
  email: string;
  organizations: { role: string }[];
}

const mailService = {
  sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountCreatedEmail: jest.fn().mockResolvedValue(undefined),
};

function getSentVerificationToken(): string {
  const calls = mailService.sendEmailVerificationEmail.mock.calls as [
    string,
    string,
    string,
  ][];
  const sentUrl = calls[calls.length - 1][2];
  return sentUrl.split('/verify-email/')[1];
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
    mailService.sendEmailVerificationEmail.mockClear();
    mailService.sendAccountCreatedEmail.mockClear();
    app = await createTestApp((builder) =>
      builder.overrideProvider(MailService).useValue(mailService),
    );
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('registers a new user without issuing a session -- the account is not usable until the email is verified', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    const body = res.body as RegisterResponseBody;

    expect(body).toEqual({
      status: 'PENDING_EMAIL_VERIFICATION',
      email: credentials.email,
    });
    expect(res.get('Set-Cookie')).toBeUndefined();
    expect(mailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
      credentials.email,
      credentials.firstName,
      expect.stringContaining('/verify-email/'),
      'fr',
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(403);
  });

  it('verifies the email via the emailed link, then logs the account in as ORG_ADMIN of its own organization', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    const token = getSentVerificationToken();

    const verifyRes = await request(app.getHttpServer())
      .post(`/api/v1/auth/verify-email/${token}`)
      .expect(200);
    const verifyBody = verifyRes.body as AuthResponseBody;
    expect(verifyBody.accessToken).toEqual(expect.any(String));
    expect(verifyBody.user.email).toBe(credentials.email);
    expect(extractRefreshCookie(verifyRes)).toContain('refresh_token=');

    // Now usable: login succeeds, and /auth/me reflects the ORG_ADMIN
    // membership created at registration.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${verifyBody.accessToken}`)
      .expect(200);
    const meBody = meRes.body as MeResponseBody;
    expect(meBody.email).toBe(credentials.email);
    expect(meBody.organizations).toHaveLength(1);
    expect(meBody.organizations[0].role).toBe('ORG_ADMIN');
  });

  it('rejects an expired or unknown verification token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email/bogus-token')
      .expect(404);
  });

  it('rejects a resend request for an already-verified account', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    const token = getSentVerificationToken();
    await request(app.getHttpServer())
      .post(`/api/v1/auth/verify-email/${token}`)
      .expect(200);

    mailService.sendEmailVerificationEmail.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .send({ email: credentials.email, password: 'irrelevant' })
      .expect(204);

    expect(mailService.sendEmailVerificationEmail).not.toHaveBeenCalled();
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

  it('rejects login for a correct password on an unverified account', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(403);
  });

  it('logs in with correct credentials and rejects wrong ones, once verified', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    await prisma.user.update({
      where: { email: credentials.email },
      data: { emailVerifiedAt: new Date() },
    });

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
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    await prisma.user.update({
      where: { email: credentials.email },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const loginBody = loginRes.body as AuthResponseBody;

    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);
    const meBody = meRes.body as MeResponseBody;

    expect(meBody.email).toBe(credentials.email);
    expect(meBody.organizations).toHaveLength(1);
  });

  it('rotates the refresh token and rejects reuse of the old one', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    await prisma.user.update({
      where: { email: credentials.email },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const firstCookie = extractRefreshCookie(loginRes);

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
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    await prisma.user.update({
      where: { email: credentials.email },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const cookie = extractRefreshCookie(loginRes);

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
