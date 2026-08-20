import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
}

interface InvitationResponseBody {
  id: string;
}

const mailService = {
  sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
  sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountCreatedEmail: jest.fn().mockResolvedValue(undefined),
};

const PASSWORD = 'a-very-strong-password';

async function registerOrganizer(
  app: INestApplication<App>,
  overrides: Partial<{ email: string; organizationName: string }> = {},
) {
  const email = overrides.email ?? 'organizer@example.com';
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email,
      password: PASSWORD,
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: overrides.organizationName ?? 'Ada Tournaments',
    })
    .expect(201);
  await app
    .get(PrismaService)
    .user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  const { accessToken } = loginRes.body as AuthResponseBody;
  const meRes = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  const { organizations } = meRes.body as { organizations: { id: string }[] };
  return { accessToken, email, organizationId: organizations[0].id };
}

describe('Account deletion (e2e)', () => {
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

  it('rejects an incorrect password', async () => {
    const { accessToken } = await registerOrganizer(app);

    await request(app.getHttpServer())
      .delete('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'wrong-password' })
      .expect(401);
  });

  it('deletes a sole-member account, clears the session, and blocks future logins', async () => {
    const { accessToken, email } = await registerOrganizer(app);

    await request(app.getHttpServer())
      .delete('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: PASSWORD })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(401);
  });

  it('deletes the organization and every downstream row (tournaments, teams, etc.) when its sole member deletes their account', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    // A lightweight stand-in for "an organization's downstream data" --
    // TeamRating belongs directly to Organization (onDelete: Cascade) and
    // needs no other setup, so it's enough to prove the cascade reaches
    // past the Organization row itself without standing up a full
    // tournament/category/team fixture.
    const teamRating = await prisma.teamRating.create({
      data: { organizationId, teamName: 'Les Copains' },
    });

    await request(app.getHttpServer())
      .delete('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: PASSWORD })
      .expect(204);

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    expect(organization).toBeNull();
    const rating = await prisma.teamRating.findUnique({
      where: { id: teamRating.id },
    });
    expect(rating).toBeNull();
  });

  it('does not fail when the account has a pending sent invitation to an organization it survives leaving (invitedById becomes null)', async () => {
    // The organization must survive this deletion for this to actually
    // exercise the invitedById FK fix -- a sole-member org's Invitation rows
    // would just cascade away with the organization itself (see the
    // dedicated cascade test above), never touching that constraint. A
    // second ORG_ADMIN keeps the org alive after the first admin deletes
    // their account.
    const { accessToken, organizationId } = await registerOrganizer(app, {
      email: 'admin-a@example.com',
    });
    const coAdminInvite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'admin-b@example.com', role: 'ORG_ADMIN' })
      .expect(201);
    void coAdminInvite;
    const coAdminToken = (
      mailService.sendInvitationEmail.mock.calls[
        mailService.sendInvitationEmail.mock.calls.length - 1
      ] as string[]
    )[2].split('/accept-invitation/')[1];
    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${coAdminToken}/accept`)
      .send({ password: PASSWORD, firstName: 'Bob', lastName: 'Backup' })
      .expect(201);

    const pendingInviteRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'referee@example.com', role: 'ORG_MEMBER' })
      .expect(201);
    const pendingInvitation = pendingInviteRes.body as InvitationResponseBody;

    await request(app.getHttpServer())
      .delete('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: PASSWORD })
      .expect(204);

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    expect(organization).not.toBeNull();
    const persisted = await prisma.invitation.findUnique({
      where: { id: pendingInvitation.id },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.invitedById).toBeNull();
  });

  it('blocks deleting the last admin of an organization that still has other members', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app, {
      email: 'admin@example.com',
    });
    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'collaborator@example.com', role: 'ORG_MEMBER' })
      .expect(201);
    const inviteToken = (
      mailService.sendInvitationEmail.mock.calls[
        mailService.sendInvitationEmail.mock.calls.length - 1
      ] as string[]
    )[2].split('/accept-invitation/')[1];
    void inviteRes;
    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${inviteToken}/accept`)
      .send({ password: PASSWORD, firstName: 'Coco', lastName: 'Laborator' })
      .expect(201);

    await request(app.getHttpServer())
      .delete('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: PASSWORD })
      .expect(409);
  });
});
