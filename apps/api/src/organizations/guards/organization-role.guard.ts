import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { OrganizationRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRE_ORG_ROLE_KEY } from '../decorators/require-org-role.decorator';

interface RequestWithUser {
  params: Record<string, string>;
  user?: AuthenticatedUser;
}

@Injectable()
export class OrganizationRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<
      OrganizationRole | undefined
    >(REQUIRE_ORG_ROLE_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRole) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const organizationId = request.params.organizationId;
    if (!organizationId || !request.user) {
      throw new ForbiddenException("Accès à l'organisation refusé.");
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: request.user.id },
      },
    });
    if (!membership) {
      throw new ForbiddenException(
        "Vous n'êtes pas membre de cette organisation.",
      );
    }
    if (
      requiredRole === OrganizationRole.ORG_ADMIN &&
      membership.role !== OrganizationRole.ORG_ADMIN
    ) {
      throw new ForbiddenException('Rôle administrateur requis.');
    }

    return true;
  }
}
