import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  function createService(permissions: { id: string; key: string }[]) {
    const prisma = {
      permission: {
        findMany: jest.fn().mockResolvedValue(permissions),
      },
    };
    return {
      service: new PermissionsService(prisma as unknown as PrismaService),
      prisma,
    };
  }

  describe('resolveKeysToIds', () => {
    it('returns an empty array without querying when given no keys', async () => {
      const { service, prisma } = createService([]);

      await expect(service.resolveKeysToIds([])).resolves.toEqual([]);
      expect(prisma.permission.findMany).not.toHaveBeenCalled();
    });

    it('resolves known keys to their ids', async () => {
      const { service } = createService([
        { id: 'perm-1', key: 'MANAGE_SCORES' },
        { id: 'perm-2', key: 'MANAGE_GENERAL' },
      ]);

      await expect(
        service.resolveKeysToIds(['MANAGE_SCORES', 'MANAGE_GENERAL']),
      ).resolves.toEqual(['perm-1', 'perm-2']);
    });

    it('rejects unknown keys', async () => {
      const { service } = createService([
        { id: 'perm-1', key: 'MANAGE_SCORES' },
      ]);

      await expect(
        service.resolveKeysToIds(['MANAGE_SCORES', 'NOT_A_KEY']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
