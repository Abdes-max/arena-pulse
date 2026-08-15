import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  organization: { create: jest.Mock };
  organizationMember: { create: jest.Mock };
  refreshToken: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    organization: { create: jest.fn() },
    organizationMember: { create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaMock) => unknown)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return prisma;
}

// Deliberately untyped, same rationale as tournaments.service.spec.ts.
function createMailServiceMock() {
  return {
    sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
    sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendAccountCreatedEmail: jest.fn().mockResolvedValue(undefined),
    sendPublicationReceiptEmail: jest.fn().mockResolvedValue(undefined),
    sendSubscriptionReceiptEmail: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AuthService', () => {
  let prisma: PrismaMock;
  let mailService: ReturnType<typeof createMailServiceMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrismaMock();
    mailService = createMailServiceMock();
    const configService = new ConfigService({
      JWT_EXPIRES_IN: '3600s',
      JWT_REFRESH_EXPIRES_IN: '30d',
    });
    const tokenService = new TokenService(
      new JwtService({ secret: 'test-secret' }),
      configService,
    );
    service = new AuthService(
      prisma as unknown as PrismaService,
      new PasswordService(),
      tokenService,
      mailService as unknown as MailService,
      configService,
    );
  });

  const registerDto = {
    email: 'organizer@example.com',
    password: 'a-very-strong-password',
    firstName: 'Ada',
    lastName: 'Lovelace',
    organizationName: 'Ada Tournaments',
  };

  describe('register', () => {
    it('creates a user, an organization and an ORG_ADMIN membership, without issuing a session', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        passwordHash: 'irrelevant',
      });
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: registerDto.organizationName,
      });
      prisma.organizationMember.create.mockResolvedValue({
        role: OrganizationRole.ORG_ADMIN,
      });

      const result = await service.register(registerDto);

      expect(result).toEqual({
        status: 'PENDING_EMAIL_VERIFICATION',
        email: registerDto.email,
      });
      expect(prisma.organizationMember.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          userId: 'user-1',
          role: OrganizationRole.ORG_ADMIN,
        },
      });
      expect(mailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
        registerDto.email,
        registerDto.firstName,
        expect.stringContaining('/verify-email/'),
      );
      expect(mailService.sendAccountCreatedEmail).toHaveBeenCalledWith(
        registerDto.email,
        registerDto.firstName,
        registerDto.organizationName,
      );
      // No refresh token issued -- the account isn't usable until verifyEmail().
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.register(registerDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('succeeds even when both emails fail to send', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        passwordHash: 'irrelevant',
      });
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: registerDto.organizationName,
      });
      prisma.organizationMember.create.mockResolvedValue({
        role: OrganizationRole.ORG_ADMIN,
      });
      mailService.sendEmailVerificationEmail.mockRejectedValue(
        new Error('SMTP unreachable'),
      );
      mailService.sendAccountCreatedEmail.mockRejectedValue(
        new Error('SMTP unreachable'),
      );

      const result = await service.register(registerDto);

      expect(result.status).toBe('PENDING_EMAIL_VERIFICATION');
    });
  });

  describe('login', () => {
    it('rejects an unknown email and a wrong password with the same generic error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const passwordService = new PasswordService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        passwordHash: await passwordService.hash('the-real-password'),
        emailVerifiedAt: new Date(),
      });
      await expect(
        service.login({ email: registerDto.email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a correct password for an unverified account', async () => {
      const passwordService = new PasswordService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        passwordHash: await passwordService.hash('the-real-password'),
        emailVerifiedAt: null,
      });

      await expect(
        service.login({
          email: registerDto.email,
          password: 'the-real-password',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts a correct password for a verified account', async () => {
      const passwordService = new PasswordService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        passwordHash: await passwordService.hash('the-real-password'),
        emailVerifiedAt: new Date(),
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: registerDto.email,
        password: 'the-real-password',
      });

      expect(result.accessToken).toEqual(expect.any(String));
    });
  });

  describe('verifyEmail', () => {
    it('marks the account verified, clears the token, and logs it in', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        emailVerificationExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.verifyEmail('some-raw-token');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          emailVerifiedAt: expect.any(Date) as unknown,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        }) as unknown,
      });
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.user.email).toBe(registerDto.email);
    });

    it('rejects an unknown token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('bogus')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects an expired token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        emailVerificationExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyEmail('expired')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resendVerificationEmail', () => {
    it('issues a fresh token and re-sends the email for an unverified account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        firstName: registerDto.firstName,
        emailVerifiedAt: null,
      });
      prisma.user.update.mockResolvedValue({});

      await service.resendVerificationEmail(registerDto.email);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          emailVerificationTokenHash: expect.any(String) as unknown,
          emailVerificationExpiresAt: expect.any(Date) as unknown,
        }) as unknown,
      });
      expect(mailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
        registerDto.email,
        registerDto.firstName,
        expect.stringContaining('/verify-email/'),
      );
    });

    it('silently no-ops for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resendVerificationEmail('nobody@example.com'),
      ).resolves.toBeUndefined();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('silently no-ops for an already-verified account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        emailVerifiedAt: new Date(),
      });

      await service.resendVerificationEmail(registerDto.email);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailService.sendEmailVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('nonexistent')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rotates a valid token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
      });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const result = await service.refresh('some-presented-token');

      expect(result.accessToken).toEqual(expect.any(String));
      const [[updateCall]] = prisma.refreshToken.update.mock.calls as [
        [{ where: { id: string }; data: { replacedByTokenId?: string } }],
      ];
      expect(updateCall.where).toEqual({ id: 'rt-1' });
      expect(updateCall.data.replacedByTokenId).toBe('rt-2');
    });

    it('revokes the whole family when a revoked token is replayed', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      await expect(service.refresh('reused-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: 'family-1', revokedAt: null },
        }),
      );
    });

    it('rejects an expired token without revoking the family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('expired-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
