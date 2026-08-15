import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationSubscriptionStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';

@Injectable()
export class SuperAdminOrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: SuperAdminAuditLogService,
  ) {}

  async list() {
    const organizations = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true, tournaments: true } },
        subscriptions: {
          where: {
            status: OrganizationSubscriptionStatus.ACTIVE,
            expiresAt: { gt: new Date() },
          },
          take: 1,
        },
      },
    });
    return organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      membersCount: organization._count.members,
      tournamentsCount: organization._count.tournaments,
      subscriptionStatus:
        organization.subscriptions.length > 0
          ? ('ACTIVE' as const)
          : ('NONE' as const),
      suspendedAt: organization.suspendedAt,
      createdAt: organization.createdAt,
    }));
  }

  async getDetail(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: { include: { user: true }, orderBy: { createdAt: 'asc' } },
        tournaments: {
          include: { sport: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!organization) {
      throw new NotFoundException('Organisation introuvable.');
    }
    return {
      id: organization.id,
      name: organization.name,
      suspendedAt: organization.suspendedAt,
      createdAt: organization.createdAt,
      members: organization.members.map((member) => ({
        id: member.id,
        userId: member.userId,
        email: member.user.email,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        role: member.role,
      })),
      tournaments: organization.tournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        sportName: tournament.sport.name,
        status: tournament.status,
      })),
    };
  }

  async suspend(organizationId: string, superAdminId: string): Promise<void> {
    const organization = await this.getOrganizationOrThrow(organizationId);
    if (organization.suspendedAt) {
      throw new ConflictException('Cette organisation est déjà suspendue.');
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { suspendedAt: new Date() },
    });
    await this.auditLog.record({
      superAdminId,
      action: 'SUSPEND_ORGANIZATION',
      targetType: 'Organization',
      targetId: organizationId,
    });
  }

  async reactivate(
    organizationId: string,
    superAdminId: string,
  ): Promise<void> {
    const organization = await this.getOrganizationOrThrow(organizationId);
    if (!organization.suspendedAt) {
      throw new ConflictException("Cette organisation n'est pas suspendue.");
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { suspendedAt: null },
    });
    await this.auditLog.record({
      superAdminId,
      action: 'REACTIVATE_ORGANIZATION',
      targetType: 'Organization',
      targetId: organizationId,
    });
  }

  private async getOrganizationOrThrow(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organisation introuvable.');
    }
    return organization;
  }
}
