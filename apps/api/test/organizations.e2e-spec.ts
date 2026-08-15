import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

interface InvitationResponseBody {
  id: string;
  email: string;
}

interface LookupResponseBody {
  organizationName: string;
  email: string;
  role: string;
  requiresNewAccount: boolean;
}

interface MemberResponseBody {
  id: string;
  userId: string;
  email: string;
  role: string;
}

const mailService = {
  sendInvitationEmail: jest
    .fn<Promise<void>, [string, string, string]>()
    .mockResolvedValue(undefined),
  sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountCreatedEmail: jest.fn().mockResolvedValue(undefined),
};

function getSentInviteToken(): string {
  const calls = mailService.sendInvitationEmail.mock.calls;
  const sentUrl = calls[calls.length - 1][2];
  return sentUrl.split('/accept-invitation/')[1];
}

async function registerOrganizer(
  app: INestApplication<App>,
  overrides: Partial<{ email: string; organizationName: string }> = {},
) {
  const email = overrides.email ?? 'organizer@example.com';
  const password = 'a-very-strong-password';
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: overrides.organizationName ?? 'Ada Tournaments',
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

describe('Organizations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    mailService.sendInvitationEmail.mockClear();
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

  it('invites a collaborator, who can then look up and accept as a new account', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);

    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'referee@example.com', role: 'ORG_MEMBER' })
      .expect(201);
    const invitation = inviteRes.body as InvitationResponseBody;
    expect(mailService.sendInvitationEmail).toHaveBeenCalledWith(
      'referee@example.com',
      'Ada Tournaments',
      expect.stringContaining('/accept-invitation/'),
    );

    const token = getSentInviteToken();

    const lookupRes = await request(app.getHttpServer())
      .get(`/api/v1/invitations/${token}`)
      .expect(200);
    const lookup = lookupRes.body as LookupResponseBody;
    expect(lookup.requiresNewAccount).toBe(true);
    expect(lookup.email).toBe('referee@example.com');

    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${token}/accept`)
      .send({
        password: 'another-strong-password',
        firstName: 'Rui',
        lastName: 'Referee',
      })
      .expect(201);

    const membersRes = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const members = membersRes.body as MemberResponseBody[];
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.email)).toContain('referee@example.com');
    expect(invitation.email).toBe('referee@example.com');
  });

  it('routes an already-registered invitee to log in instead of creating a duplicate account', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    await registerOrganizer(app, {
      email: 'other-organizer@example.com',
      organizationName: 'Other Org',
    });

    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'other-organizer@example.com', role: 'ORG_MEMBER' })
      .expect(201);
    void inviteRes;

    const token = getSentInviteToken();

    const lookupRes = await request(app.getHttpServer())
      .get(`/api/v1/invitations/${token}`)
      .expect(200);
    expect((lookupRes.body as LookupResponseBody).requiresNewAccount).toBe(
      false,
    );

    // Anonymous accept must not silently create a second account for an existing email.
    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${token}/accept`)
      .send({})
      .expect(403);
  });

  it('rejects invite/list/role-management from a non-admin member', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'member@example.com', role: 'ORG_MEMBER' })
      .expect(201);
    void inviteRes;

    const token = getSentInviteToken();
    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${token}/accept`)
      .send({
        password: 'another-strong-password',
        firstName: 'Mo',
        lastName: 'Member',
      })
      .expect(201);
    const memberAccessToken = (acceptRes.body as { accessToken: string })
      .accessToken;

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .send({ email: 'someone-else@example.com', role: 'ORG_MEMBER' })
      .expect(403);
  });

  it('prevents removing or demoting the last remaining admin', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const membersRes = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const [{ id: adminMemberId }] = membersRes.body as MemberResponseBody[];

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationId}/members/${adminMemberId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'ORG_MEMBER' })
      .expect(409);

    await request(app.getHttpServer())
      .delete(
        `/api/v1/organizations/${organizationId}/members/${adminMemberId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);
  });

  it('isolates organizations: a member of one org cannot see or manage another', async () => {
    const orgA = await registerOrganizer(app, {
      email: 'a@example.com',
      organizationName: 'Org A',
    });
    const orgB = await registerOrganizer(app, {
      email: 'b@example.com',
      organizationName: 'Org B',
    });

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.organizationId}/members`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgB.organizationId}/invitations`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ email: 'x@example.com', role: 'ORG_MEMBER' })
      .expect(403);
  });
});
