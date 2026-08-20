import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeleteUserDto } from './dto/delete-user.dto';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';
import { SuperAdminOrganizationsService } from './super-admin-organizations.service';

@Injectable()
export class SuperAdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: SuperAdminAuditLogService,
    // Injected rather than duplicating deleteOrganizationCascade's
    // file-cleanup logic a second time -- see deleteUser below.
    private readonly organizationsService: SuperAdminOrganizationsService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { memberships: { include: { organization: true } } },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      organizations: user.memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
      })),
    }));
  }

  /** Bypasses the emailed link entirely -- for accounts that never received/clicked it and can't otherwise unblock themselves. */
  async verifyEmail(userId: string, superAdminId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Compte introuvable.');
    }
    if (user.emailVerifiedAt) {
      throw new ConflictException('Cet email est déjà vérifié.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });
    await this.auditLog.record({
      superAdminId,
      action: 'VERIFY_USER_EMAIL',
      targetType: 'User',
      targetId: userId,
    });
  }

  /**
   * Super-admin-initiated equivalent of AuthService.deleteAccount -- same
   * sole-organization cascade / "last admin" guard, minus the password
   * check (the super-admin doesn't have the target's password; the typed
   * "SUPPRIMER" confirmation is the safety gate here instead).
   */
  async deleteUser(
    userId: string,
    superAdminId: string,
    dto: DeleteUserDto,
  ): Promise<void> {
    if (dto.confirmation.trim().toUpperCase() !== 'SUPPRIMER') {
      throw new BadRequestException(
        'Confirmation invalide : tapez SUPPRIMER pour confirmer.',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Compte introuvable.');
    }
    const soleOrganizationIds =
      await this.assertCanDeleteUserAndGetSoleOrganizations(userId);
    for (const organizationId of soleOrganizationIds) {
      // Deletes its own row + files -- prisma.user.delete below would
      // orphan-cascade the membership anyway, but going through here first
      // keeps every organization deletion audited/logo-cleaned the same
      // way regardless of who triggered it.
      await this.organizationsService.deleteOrganizationCascade(
        organizationId,
        superAdminId,
      );
    }
    await this.prisma.user.delete({ where: { id: userId } });
    await this.auditLog.record({
      superAdminId,
      action: 'DELETE_USER',
      targetType: 'User',
      targetId: userId,
      note: user.email,
    });
  }

  /** Mirrors AuthService.assertCanDeleteAccountAndGetSoleOrganizations exactly, minus the password check it has no way to perform here. */
  private async assertCanDeleteUserAndGetSoleOrganizations(
    userId: string,
  ): Promise<string[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: { include: { members: true } } },
    });
    const soleOrganizationIds: string[] = [];
    for (const membership of memberships) {
      const others = membership.organization.members.filter(
        (member) => member.userId !== userId,
      );
      if (others.length === 0) {
        soleOrganizationIds.push(membership.organizationId);
        continue;
      }
      const hasOtherAdmin = others.some(
        (member) => member.role === OrganizationRole.ORG_ADMIN,
      );
      if (!hasOtherAdmin) {
        throw new ConflictException(
          `Cette personne est la seule administratrice de « ${membership.organization.name} ». Promouvez un autre membre avant de supprimer ce compte.`,
        );
      }
    }
    return soleOrganizationIds;
  }
}
