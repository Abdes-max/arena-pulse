import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      role: member.role,
      joinedAt: member.createdAt,
    }));
  }

  async changeRole(
    organizationId: string,
    memberId: string,
    role: OrganizationRole,
  ) {
    const member = await this.getMemberOrThrow(organizationId, memberId);
    if (
      member.role === OrganizationRole.ORG_ADMIN &&
      role !== OrganizationRole.ORG_ADMIN
    ) {
      await this.assertNotLastAdmin(organizationId, memberId);
    }
    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
    });
    return { userId: updated.userId, role: updated.role };
  }

  async removeMember(organizationId: string, memberId: string): Promise<void> {
    const member = await this.getMemberOrThrow(organizationId, memberId);
    if (member.role === OrganizationRole.ORG_ADMIN) {
      await this.assertNotLastAdmin(organizationId, memberId);
    }
    await this.prisma.organizationMember.delete({ where: { id: memberId } });
  }

  private async getMemberOrThrow(organizationId: string, memberId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.organizationId !== organizationId) {
      throw new NotFoundException('Membre introuvable.');
    }
    return member;
  }

  private async assertNotLastAdmin(
    organizationId: string,
    excludingMemberId: string,
  ): Promise<void> {
    const remainingAdmins = await this.prisma.organizationMember.count({
      where: {
        organizationId,
        role: OrganizationRole.ORG_ADMIN,
        id: { not: excludingMemberId },
      },
    });
    if (remainingAdmins === 0) {
      throw new ConflictException(
        "Impossible de retirer le dernier administrateur de l'organisation.",
      );
    }
  }
}
