import { ConflictException, NotFoundException } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentAdministratorsService } from './tournament-administrators.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  organizationMember: { findFirst: jest.Mock };
  tournamentAdministrator: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  tournamentAdministratorPermission: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    organizationMember: { findFirst: jest.fn() },
    tournamentAdministrator: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    tournamentAdministratorPermission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
}

const ADMIN_USER = {
  id: 'user-1',
  email: 'ref@example.com',
  firstName: 'Rui',
  lastName: 'Referee',
};

describe('TournamentAdministratorsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let permissionsService: { resolveKeysToIds: jest.Mock };
  let service: TournamentAdministratorsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1' }),
      assertTournamentExists: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1' }),
    };
    permissionsService = {
      resolveKeysToIds: jest.fn().mockResolvedValue(['perm-1']),
    };
    service = new TournamentAdministratorsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      permissionsService as unknown as PermissionsService,
    );
  });

  describe('add', () => {
    it('rejects adding someone who is not an organization member', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(null);

      await expect(
        service.add('org-1', 'tournament-1', {
          email: 'ref@example.com',
          permissionKeys: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tournamentAdministrator.create).not.toHaveBeenCalled();
    });

    it('rejects adding someone who is already a tournament administrator', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: ADMIN_USER.id,
      });
      prisma.tournamentAdministrator.findUnique.mockResolvedValue({
        id: 'existing-admin',
      });

      await expect(
        service.add('org-1', 'tournament-1', {
          email: ADMIN_USER.email,
          permissionKeys: [],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('adds an administrator with the resolved permissions', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: ADMIN_USER.id,
      });
      prisma.tournamentAdministrator.findUnique.mockResolvedValue(null);
      prisma.tournamentAdministrator.create.mockResolvedValue({
        id: 'admin-1',
        userId: ADMIN_USER.id,
        user: ADMIN_USER,
        permissions: [{ permission: { key: 'MANAGE_SCORES' } }],
      });

      const result = await service.add('org-1', 'tournament-1', {
        email: ADMIN_USER.email,
        permissionKeys: ['MANAGE_SCORES'],
      });

      expect(result.permissionKeys).toEqual(['MANAGE_SCORES']);
      expect(result.email).toBe(ADMIN_USER.email);
    });
  });

  describe('updatePermissions / remove', () => {
    it('rejects mutating an administrator that belongs to another tournament', async () => {
      prisma.tournamentAdministrator.findUnique.mockResolvedValue({
        id: 'admin-1',
        tournamentId: 'other-tournament',
      });

      await expect(
        service.updatePermissions('org-1', 'tournament-1', 'admin-1', {
          permissionKeys: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.remove('org-1', 'tournament-1', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('replaces the full permission set', async () => {
      prisma.tournamentAdministrator.findUnique.mockResolvedValue({
        id: 'admin-1',
        tournamentId: 'tournament-1',
      });
      prisma.tournamentAdministrator.findUniqueOrThrow.mockResolvedValue({
        id: 'admin-1',
        userId: ADMIN_USER.id,
        user: ADMIN_USER,
        permissions: [{ permission: { key: 'MANAGE_GENERAL' } }],
      });

      await service.updatePermissions('org-1', 'tournament-1', 'admin-1', {
        permissionKeys: ['MANAGE_GENERAL'],
      });

      expect(
        prisma.tournamentAdministratorPermission.deleteMany,
      ).toHaveBeenCalledWith({
        where: { tournamentAdministratorId: 'admin-1' },
      });
      expect(
        prisma.tournamentAdministratorPermission.createMany,
      ).toHaveBeenCalledWith({
        data: [
          { tournamentAdministratorId: 'admin-1', permissionId: 'perm-1' },
        ],
      });
    });
  });
});
