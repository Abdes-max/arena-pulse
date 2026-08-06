import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { OrganizationRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRE_TOURNAMENT_PERMISSION_KEY } from '../decorators/require-tournament-permission.decorator';

interface RequestWithUser {
  params: Record<string, string>;
  user?: AuthenticatedUser;
}

/**
 * Grants access if the caller is ORG_ADMIN of the organization (full access,
 * unchanged from feat/007), or if they're a TournamentAdministrator of this
 * specific tournament holding the required Permission key. Runs after
 * OrganizationRoleGuard, which already guarantees at least ORG_MEMBER.
 */
@Injectable()
export class TournamentPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissionKey = this.reflector.getAllAndOverride<
      string | undefined
    >(REQUIRE_TOURNAMENT_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissionKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const organizationId = request.params.organizationId;
    const tournamentId = request.params.tournamentId;
    if (!organizationId || !tournamentId || !request.user) {
      throw new ForbiddenException('Accès à ce tournoi refusé.');
    }
    const userId = request.user.id;

    // Enforced here, not left to each service to remember: a tournamentId
    // belonging to another organization must never grant access through
    // this guard, whatever the URL happens to contain. NotFoundException
    // (not Forbidden) so a wrong-org tournament reads identically to a
    // nonexistent one -- same reasoning as TournamentsService.getOrThrow.
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { organizationId: true },
    });
    if (!tournament || tournament.organizationId !== organizationId) {
      throw new NotFoundException('Tournoi introuvable.');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException(
        "Vous n'êtes pas membre de cette organisation.",
      );
    }
    if (membership.role === OrganizationRole.ORG_ADMIN) {
      return true;
    }

    const administrator = await this.prisma.tournamentAdministrator.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      include: { permissions: { include: { permission: true } } },
    });
    if (!administrator) {
      throw new ForbiddenException(
        "Vous n'êtes pas administrateur de ce tournoi.",
      );
    }
    const hasPermission = administrator.permissions.some(
      (grant) => grant.permission.key === requiredPermissionKey,
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        `Permission manquante : ${requiredPermissionKey}.`,
      );
    }

    return true;
  }
}
