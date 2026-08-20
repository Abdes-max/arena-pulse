import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminUsersService } from './super-admin-users.service';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';
import { SuperAdminOrganizationsService } from './super-admin-organizations.service';

// Only covers deleteUser (feat/173) -- list/verifyEmail have no unit spec
// of their own yet.
type PrismaMock = {
  user: { findUnique: jest.Mock; delete: jest.Mock };
  organizationMember: { findMany: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    user: { findUnique: jest.fn(), delete: jest.fn() },
    organizationMember: { findMany: jest.fn() },
  };
}

describe('SuperAdminUsersService.deleteUser', () => {
  let prisma: PrismaMock;
  let auditLog: { record: jest.Mock };
  let organizationsService: { deleteOrganizationCascade: jest.Mock };
  let service: SuperAdminUsersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    organizationsService = {
      deleteOrganizationCascade: jest.fn().mockResolvedValue(undefined),
    };
    service = new SuperAdminUsersService(
      prisma as unknown as PrismaService,
      auditLog as unknown as SuperAdminAuditLogService,
      organizationsService as unknown as SuperAdminOrganizationsService,
    );
  });

  it('rejects an invalid confirmation without deleting anything', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(
      service.deleteUser('user-1', 'super-admin-1', { confirmation: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('blocks deletion when it would leave an organization with other members but no admin', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.organizationMember.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        organizationId: 'org-1',
        organization: {
          name: 'Ada Tournaments',
          members: [
            { userId: 'user-1', role: OrganizationRole.ORG_ADMIN },
            { userId: 'user-2', role: OrganizationRole.ORG_MEMBER },
          ],
        },
      },
    ]);

    await expect(
      service.deleteUser('user-1', 'super-admin-1', {
        confirmation: 'SUPPRIMER',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(
      organizationsService.deleteOrganizationCascade,
    ).not.toHaveBeenCalled();
  });

  it('cascades the organization when the user is its sole member, then deletes the user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
    });
    prisma.organizationMember.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        organizationId: 'org-1',
        organization: {
          name: 'Ada Tournaments',
          members: [{ userId: 'user-1', role: OrganizationRole.ORG_ADMIN }],
        },
      },
    ]);
    prisma.user.delete.mockResolvedValue({ id: 'user-1' });

    await service.deleteUser('user-1', 'super-admin-1', {
      confirmation: 'SUPPRIMER',
    });

    expect(organizationsService.deleteOrganizationCascade).toHaveBeenCalledWith(
      'org-1',
      'super-admin-1',
    );
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        superAdminId: 'super-admin-1',
        action: 'DELETE_USER',
        targetType: 'User',
        targetId: 'user-1',
      }),
    );
  });
});
