import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from './organizations.service';

type PrismaMock = {
  organizationMember: {
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    organizationMember: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };
}

describe('OrganizationsService', () => {
  let prisma: PrismaMock;
  let service: OrganizationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new OrganizationsService(prisma as unknown as PrismaService);
  });

  it('rejects changing an unknown member (or one from another org)', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    await expect(
      service.changeRole('org-1', 'member-1', OrganizationRole.ORG_MEMBER),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.organizationMember.findUnique.mockResolvedValue({
      organizationId: 'org-2',
      role: OrganizationRole.ORG_ADMIN,
    });
    await expect(
      service.changeRole('org-1', 'member-1', OrganizationRole.ORG_MEMBER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks demoting the last admin', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      id: 'member-1',
      organizationId: 'org-1',
      role: OrganizationRole.ORG_ADMIN,
    });
    prisma.organizationMember.count.mockResolvedValue(0);

    await expect(
      service.changeRole('org-1', 'member-1', OrganizationRole.ORG_MEMBER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.organizationMember.update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another admin remains', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      id: 'member-1',
      organizationId: 'org-1',
      role: OrganizationRole.ORG_ADMIN,
    });
    prisma.organizationMember.count.mockResolvedValue(1);
    prisma.organizationMember.update.mockResolvedValue({
      userId: 'user-1',
      role: OrganizationRole.ORG_MEMBER,
    });

    const result = await service.changeRole(
      'org-1',
      'member-1',
      OrganizationRole.ORG_MEMBER,
    );
    expect(result).toEqual({
      userId: 'user-1',
      role: OrganizationRole.ORG_MEMBER,
    });
  });

  it('blocks removing the last admin', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      id: 'member-1',
      organizationId: 'org-1',
      role: OrganizationRole.ORG_ADMIN,
    });
    prisma.organizationMember.count.mockResolvedValue(0);

    await expect(
      service.removeMember('org-1', 'member-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.organizationMember.delete).not.toHaveBeenCalled();
  });

  it('allows removing a non-admin member freely', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      id: 'member-2',
      organizationId: 'org-1',
      role: OrganizationRole.ORG_MEMBER,
    });

    await service.removeMember('org-1', 'member-2');
    expect(prisma.organizationMember.count).not.toHaveBeenCalled();
    expect(prisma.organizationMember.delete).toHaveBeenCalledWith({
      where: { id: 'member-2' },
    });
  });
});
