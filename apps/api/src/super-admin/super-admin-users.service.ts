import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';

@Injectable()
export class SuperAdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: SuperAdminAuditLogService,
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
}
