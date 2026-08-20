import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminAuthService } from './super-admin-auth.service';

// Only covers deleteAccount (feat/171, confirmation-word gate feat/173) --
// login/refresh/logout/getProfile have no unit spec of their own yet (their
// behavior is exercised by super-admin-auth.e2e-spec.ts instead), so this
// file stays scoped to the new method rather than retrofitting coverage for
// pre-existing ones.
type PrismaMock = {
  superAdminAccount: {
    findUniqueOrThrow: jest.Mock;
    count: jest.Mock;
    delete: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    superAdminAccount: {
      findUniqueOrThrow: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('SuperAdminAuthService.deleteAccount', () => {
  let prisma: PrismaMock;
  let service: SuperAdminAuthService;

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
    service = new SuperAdminAuthService(
      prisma as unknown as PrismaService,
      new PasswordService(),
      tokenService,
    );
  });

  it('rejects an invalid confirmation without deleting anything', async () => {
    prisma.superAdminAccount.findUniqueOrThrow.mockResolvedValue({
      id: 'super-admin-1',
    });

    await expect(
      service.deleteAccount('super-admin-1', { confirmation: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.superAdminAccount.delete).not.toHaveBeenCalled();
  });

  it('rejects deleting the last remaining super-admin account', async () => {
    prisma.superAdminAccount.findUniqueOrThrow.mockResolvedValue({
      id: 'super-admin-1',
    });
    prisma.superAdminAccount.count.mockResolvedValue(0);

    await expect(
      service.deleteAccount('super-admin-1', { confirmation: 'SUPPRIMER' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.superAdminAccount.delete).not.toHaveBeenCalled();
  });

  it('deletes the account when another super-admin account remains', async () => {
    prisma.superAdminAccount.findUniqueOrThrow.mockResolvedValue({
      id: 'super-admin-1',
    });
    prisma.superAdminAccount.count.mockResolvedValue(1);
    prisma.superAdminAccount.delete.mockResolvedValue({ id: 'super-admin-1' });

    // Case/whitespace-insensitive, checked as part of the same run.
    await service.deleteAccount('super-admin-1', {
      confirmation: ' supprimer ',
    });

    expect(prisma.superAdminAccount.delete).toHaveBeenCalledWith({
      where: { id: 'super-admin-1' },
    });
  });
});
