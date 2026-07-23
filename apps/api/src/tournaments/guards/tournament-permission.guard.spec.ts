import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TournamentPermissionGuard } from './tournament-permission.guard';

type PrismaMock = {
  organizationMember: { findUnique: jest.Mock };
  tournamentAdministrator: { findUnique: jest.Mock };
};

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

describe('TournamentPermissionGuard', () => {
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      organizationMember: { findUnique: jest.fn() },
      tournamentAdministrator: { findUnique: jest.fn() },
    };
  });

  function createGuard(requiredPermissionKey: string | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredPermissionKey),
    } as unknown as Reflector;
    return new TournamentPermissionGuard(
      reflector,
      prisma as unknown as PrismaService,
    );
  }

  const params = { organizationId: 'org-1', tournamentId: 'tournament-1' };
  const user = { id: 'user-1', email: 'a@example.com' };

  it('allows the route through when no permission is required', async () => {
    const guard = createGuard(undefined);
    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
  });

  it('rejects when the caller has no membership in the organization', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    const guard = createGuard('MANAGE_PARTICIPANTS');

    await expect(
      guard.canActivate(createContext(params, user)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an ORG_ADMIN through regardless of TournamentAdministrator status', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      role: OrganizationRole.ORG_ADMIN,
    });
    const guard = createGuard('MANAGE_PARTICIPANTS');

    await expect(
      guard.canActivate(createContext(params, user)),
    ).resolves.toBe(true);
    expect(prisma.tournamentAdministrator.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an ORG_MEMBER who is not a TournamentAdministrator of this tournament', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      role: OrganizationRole.ORG_MEMBER,
    });
    prisma.tournamentAdministrator.findUnique.mockResolvedValue(null);
    const guard = createGuard('MANAGE_PARTICIPANTS');

    await expect(
      guard.canActivate(createContext(params, user)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a TournamentAdministrator missing the required permission', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      role: OrganizationRole.ORG_MEMBER,
    });
    prisma.tournamentAdministrator.findUnique.mockResolvedValue({
      permissions: [{ permission: { key: 'MANAGE_SCORES' } }],
    });
    const guard = createGuard('MANAGE_PARTICIPANTS');

    await expect(
      guard.canActivate(createContext(params, user)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a TournamentAdministrator holding the required permission', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      role: OrganizationRole.ORG_MEMBER,
    });
    prisma.tournamentAdministrator.findUnique.mockResolvedValue({
      permissions: [{ permission: { key: 'MANAGE_PARTICIPANTS' } }],
    });
    const guard = createGuard('MANAGE_PARTICIPANTS');

    await expect(
      guard.canActivate(createContext(params, user)),
    ).resolves.toBe(true);
  });
});
