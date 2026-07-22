import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationRoleGuard } from './organization-role.guard';

type PrismaMock = { organizationMember: { findUnique: jest.Mock } };

function createContext(
  params: Record<string, string>,
  user?: { id: string; email: string },
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ params, user }),
    }),
  } as unknown as ExecutionContext;
}

describe('OrganizationRoleGuard', () => {
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = { organizationMember: { findUnique: jest.fn() } };
  });

  function createGuard(requiredRole: OrganizationRole | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRole),
    } as unknown as Reflector;
    return new OrganizationRoleGuard(
      reflector,
      prisma as unknown as PrismaService,
    );
  }

  it('allows the route through when no role is required', async () => {
    const guard = createGuard(undefined);
    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
  });

  it('rejects when the caller has no membership in the organization', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    const guard = createGuard(OrganizationRole.ORG_MEMBER);

    await expect(
      guard.canActivate(
        createContext(
          { organizationId: 'org-1' },
          { id: 'user-1', email: 'a@example.com' },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an ORG_ADMIN through an ORG_MEMBER requirement', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      role: OrganizationRole.ORG_ADMIN,
    });
    const guard = createGuard(OrganizationRole.ORG_MEMBER);

    await expect(
      guard.canActivate(
        createContext(
          { organizationId: 'org-1' },
          { id: 'user-1', email: 'a@example.com' },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('rejects an ORG_MEMBER against an ORG_ADMIN requirement', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      role: OrganizationRole.ORG_MEMBER,
    });
    const guard = createGuard(OrganizationRole.ORG_ADMIN);

    await expect(
      guard.canActivate(
        createContext(
          { organizationId: 'org-1' },
          { id: 'user-1', email: 'a@example.com' },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
