import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
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

describe('AuthService', () => {
  let prisma: PrismaMock;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrismaMock();
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
    it('creates a user, an organization and an ORG_ADMIN membership', async () => {
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
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register(registerDto);

      expect(result.user.email).toBe(registerDto.email);
      expect(result.organization).toEqual({
        id: 'org-1',
        name: registerDto.organizationName,
        role: 'ORG_ADMIN',
      });
      expect(result.accessToken).toEqual(expect.any(String));
      expect(prisma.organizationMember.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          userId: 'user-1',
          role: OrganizationRole.ORG_ADMIN,
        },
      });
    });

    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.register(registerDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
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
      });
      await expect(
        service.login({ email: registerDto.email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
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
