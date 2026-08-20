import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminOrganizationsService } from './super-admin-organizations.service';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';

// Only covers deleteOrganization/deleteOrganizationCascade (feat/173) --
// list/getDetail/suspend/reactivate have no unit spec of their own yet.
// Every fixture uses logoUrl: null so deleteLogoFile's early-return path is
// exercised without touching the real filesystem.
type PrismaMock = {
  organization: { findUnique: jest.Mock; delete: jest.Mock };
  tournament: { findMany: jest.Mock };
  team: { findMany: jest.Mock };
  tournamentSponsor: { findMany: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    organization: { findUnique: jest.fn(), delete: jest.fn() },
    tournament: { findMany: jest.fn().mockResolvedValue([]) },
    team: { findMany: jest.fn().mockResolvedValue([]) },
    tournamentSponsor: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('SuperAdminOrganizationsService.deleteOrganization', () => {
  let prisma: PrismaMock;
  let auditLog: { record: jest.Mock };
  let service: SuperAdminOrganizationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    service = new SuperAdminOrganizationsService(
      prisma as unknown as PrismaService,
      new ConfigService({}),
      auditLog as unknown as SuperAdminAuditLogService,
    );
  });

  it('rejects an invalid confirmation without deleting anything', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Ada Tournaments',
    });

    await expect(
      service.deleteOrganization('org-1', 'super-admin-1', {
        confirmation: 'nope',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.organization.delete).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('deletes the organization and audit-logs it when confirmed', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Ada Tournaments',
    });
    prisma.organization.delete.mockResolvedValue({ id: 'org-1' });

    // Case/whitespace-insensitive, checked as part of the same run.
    await service.deleteOrganization('org-1', 'super-admin-1', {
      confirmation: '  supprimer  ',
    });

    expect(prisma.organization.delete).toHaveBeenCalledWith({
      where: { id: 'org-1' },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        superAdminId: 'super-admin-1',
        action: 'DELETE_ORGANIZATION',
        targetType: 'Organization',
        targetId: 'org-1',
      }),
    );
  });
});
