import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { OrganizationSubscriptionStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeleteOrganizationDto } from './dto/delete-organization.dto';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';

@Injectable()
export class SuperAdminOrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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

  /**
   * Deletes an organization and everything under it (tournaments, teams,
   * players, registrations, subscriptions, invitations, etc. -- Prisma
   * `onDelete: Cascade` already covers all of that, see
   * apps/api/prisma/schema.prisma) -- unconditional, no "last admin" guard:
   * unlike a self-service organizer deletion (AuthService.deleteAccount),
   * the super-admin is deliberately deleting the whole organization, admins
   * included, not sweeping one up as a side effect of removing a person.
   *
   * Public (not private) because SuperAdminUsersService.deleteUser calls
   * this for every organization a deleted organizer was the sole member
   * of, rather than duplicating the file-cleanup logic below a second time.
   */
  async deleteOrganizationCascade(
    organizationId: string,
    superAdminId: string,
  ): Promise<void> {
    const organization = await this.getOrganizationOrThrow(organizationId);
    const [tournaments, teams, sponsors] = await Promise.all([
      this.prisma.tournament.findMany({
        where: { organizationId },
        select: { logoUrl: true },
      }),
      this.prisma.team.findMany({
        where: { tournament: { organizationId } },
        select: { logoUrl: true },
      }),
      this.prisma.tournamentSponsor.findMany({
        where: { tournament: { organizationId } },
        select: { logoUrl: true },
      }),
    ]);
    await this.prisma.organization.delete({ where: { id: organizationId } });
    await Promise.all([
      ...tournaments.map((t) =>
        this.deleteLogoFile('tournament-logos', t.logoUrl),
      ),
      ...teams.map((t) => this.deleteLogoFile('team-logos', t.logoUrl)),
      ...sponsors.map((s) => this.deleteLogoFile('sponsor-logos', s.logoUrl)),
    ]);
    await this.auditLog.record({
      superAdminId,
      action: 'DELETE_ORGANIZATION',
      targetType: 'Organization',
      targetId: organizationId,
      note: organization.name,
    });
  }

  async deleteOrganization(
    organizationId: string,
    superAdminId: string,
    dto: DeleteOrganizationDto,
  ): Promise<void> {
    this.assertConfirmation(dto.confirmation);
    await this.deleteOrganizationCascade(organizationId, superAdminId);
  }

  /**
   * Requires literally typing "SUPPRIMER" (case/whitespace-insensitive),
   * checked server-side too -- not just a disabled button client-side, same
   * defense-in-depth level as the password it replaces on self-deletion
   * (see AuthService.deleteAccount / SuperAdminAuthService.deleteAccount).
   * Duplicated identically in the other super-admin delete methods below
   * and in the tournaments/users services -- consistent with this
   * codebase's existing style of small duplicated guards rather than a
   * shared utility for a one-line check.
   */
  private assertConfirmation(confirmation: string): void {
    if (confirmation.trim().toUpperCase() !== 'SUPPRIMER') {
      throw new BadRequestException(
        'Confirmation invalide : tapez SUPPRIMER pour confirmer.',
      );
    }
  }

  private uploadsDir(): string {
    return this.configService.get<string>('UPLOADS_DIR', './uploads');
  }

  private async deleteLogoFile(
    subdir: string,
    logoUrl: string | null,
  ): Promise<void> {
    if (!logoUrl) {
      return;
    }
    const filename = logoUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await fs.unlink(join(this.uploadsDir(), subdir, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
