import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  InvitationStatus,
  OrganizationRole,
} from '../../generated/prisma/client';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationsService } from './invitations.service';

type PrismaMock = {
  organizationMember: { findFirst: jest.Mock; create: jest.Mock };
  invitation: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  organization: { findUniqueOrThrow: jest.Mock };
  user: { findUnique: jest.Mock; create: jest.Mock };
  refreshToken: { create: jest.Mock };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    organizationMember: { findFirst: jest.fn(), create: jest.fn() },
    invitation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: { findUniqueOrThrow: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: { create: jest.fn() },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaMock) => unknown)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return prisma;
}

describe('InvitationsService', () => {
  let prisma: PrismaMock;
  let mailService: { sendInvitationEmail: jest.Mock };
  let service: InvitationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    mailService = {
      sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
    };
    const tokenService = new TokenService(
      new JwtService({ secret: 'test-secret' }),
      new ConfigService({
        JWT_EXPIRES_IN: '3600s',
        JWT_REFRESH_EXPIRES_IN: '30d',
      }),
    );
    service = new InvitationsService(
      prisma as unknown as PrismaService,
      mailService as unknown as MailService,
      new PasswordService(),
      tokenService,
      new ConfigService({ ADMIN_WEB_URL: 'http://localhost:4300' }),
    );
  });

  describe('invite', () => {
    it('rejects inviting someone already a member', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue({ id: 'member-1' });

      await expect(
        service.invite('org-1', 'inviter-1', {
          email: 'existing@example.com',
          role: OrganizationRole.ORG_MEMBER,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mailService.sendInvitationEmail).not.toHaveBeenCalled();
    });

    it('rejects a duplicate pending invitation for the same email', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue({
        id: 'invitation-1',
        status: InvitationStatus.PENDING,
      });

      await expect(
        service.invite('org-1', 'inviter-1', {
          email: 'pending@example.com',
          role: OrganizationRole.ORG_MEMBER,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mailService.sendInvitationEmail).not.toHaveBeenCalled();
    });

    it('creates the invitation and sends the email otherwise', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.organization.findUniqueOrThrow.mockResolvedValue({
        id: 'org-1',
        name: 'Ada Tournaments',
      });
      prisma.invitation.create.mockResolvedValue({
        id: 'invitation-1',
        email: 'new@example.com',
        role: OrganizationRole.ORG_MEMBER,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(),
      });

      const result = await service.invite('org-1', 'inviter-1', {
        email: 'new@example.com',
        role: OrganizationRole.ORG_MEMBER,
      });

      expect(result.email).toBe('new@example.com');
      expect(mailService.sendInvitationEmail).toHaveBeenCalledWith(
        'new@example.com',
        'Ada Tournaments',
        expect.stringContaining('http://localhost:4300/accept-invitation/'),
      );
    });

    it('still creates the invitation when sending the email fails', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.organization.findUniqueOrThrow.mockResolvedValue({
        id: 'org-1',
        name: 'Ada Tournaments',
      });
      prisma.invitation.create.mockResolvedValue({
        id: 'invitation-1',
        email: 'new@example.com',
        role: OrganizationRole.ORG_MEMBER,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(),
      });
      mailService.sendInvitationEmail.mockRejectedValue(
        new Error('SMTP unreachable'),
      );

      const result = await service.invite('org-1', 'inviter-1', {
        email: 'new@example.com',
        role: OrganizationRole.ORG_MEMBER,
      });

      expect(result.id).toBe('invitation-1');
    });
  });

  describe('lookup', () => {
    it('rejects an unknown or non-pending token', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      await expect(service.lookup('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects an expired invitation', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000),
        organization: { name: 'Ada Tournaments' },
        email: 'a@example.com',
      });
      await expect(service.lookup('expired')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reports whether the invited email already has an account', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        organization: { name: 'Ada Tournaments' },
        email: 'a@example.com',
        role: OrganizationRole.ORG_MEMBER,
      });
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.lookup('valid-token');
      expect(result.requiresNewAccount).toBe(true);
    });
  });
});
