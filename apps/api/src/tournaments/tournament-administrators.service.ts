import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Permission,
  TournamentAdministrator,
  TournamentAdministratorPermission,
  User,
} from '../../generated/prisma/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddTournamentAdministratorDto } from './dto/add-tournament-administrator.dto';
import { UpdateTournamentAdministratorPermissionsDto } from './dto/update-tournament-administrator-permissions.dto';
import { TournamentsService } from './tournaments.service';

type AdministratorWithRelations = TournamentAdministrator & {
  user: User;
  permissions: (TournamentAdministratorPermission & {
    permission: Permission;
  })[];
};

const ADMINISTRATOR_INCLUDE = {
  user: true,
  permissions: { include: { permission: true } },
} as const;

@Injectable()
export class TournamentAdministratorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async list(organizationId: string, tournamentId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const administrators = await this.prisma.tournamentAdministrator.findMany({
      where: { tournamentId },
      include: ADMINISTRATOR_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return administrators.map((administrator) => this.toSummary(administrator));
  }

  async add(
    organizationId: string,
    tournamentId: string,
    dto: AddTournamentAdministratorDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );

    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId, user: { email: dto.email } },
    });
    if (!membership) {
      throw new NotFoundException(
        "Cette personne doit d'abord être membre de l'organisation.",
      );
    }

    const existing = await this.prisma.tournamentAdministrator.findUnique({
      where: {
        tournamentId_userId: { tournamentId, userId: membership.userId },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Cette personne est déjà administratrice de ce tournoi.',
      );
    }

    const permissionIds = await this.permissionsService.resolveKeysToIds(
      dto.permissionKeys,
    );

    const administrator = await this.prisma.tournamentAdministrator.create({
      data: {
        tournamentId,
        userId: membership.userId,
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: ADMINISTRATOR_INCLUDE,
    });
    return this.toSummary(administrator);
  }

  async updatePermissions(
    organizationId: string,
    tournamentId: string,
    administratorId: string,
    dto: UpdateTournamentAdministratorPermissionsDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrow(tournamentId, administratorId);

    const permissionIds = await this.permissionsService.resolveKeysToIds(
      dto.permissionKeys,
    );

    await this.prisma.tournamentAdministratorPermission.deleteMany({
      where: { tournamentAdministratorId: administratorId },
    });
    await this.prisma.tournamentAdministratorPermission.createMany({
      data: permissionIds.map((permissionId) => ({
        tournamentAdministratorId: administratorId,
        permissionId,
      })),
    });

    const updated = await this.prisma.tournamentAdministrator.findUniqueOrThrow(
      {
        where: { id: administratorId },
        include: ADMINISTRATOR_INCLUDE,
      },
    );
    return this.toSummary(updated);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    administratorId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrow(tournamentId, administratorId);
    await this.prisma.tournamentAdministrator.delete({
      where: { id: administratorId },
    });
  }

  private async getOrThrow(
    tournamentId: string,
    administratorId: string,
  ): Promise<TournamentAdministrator> {
    const administrator = await this.prisma.tournamentAdministrator.findUnique({
      where: { id: administratorId },
    });
    if (!administrator || administrator.tournamentId !== tournamentId) {
      throw new NotFoundException('Administrateur de tournoi introuvable.');
    }
    return administrator;
  }

  private toSummary(administrator: AdministratorWithRelations) {
    return {
      id: administrator.id,
      userId: administrator.userId,
      email: administrator.user.email,
      firstName: administrator.user.firstName,
      lastName: administrator.user.lastName,
      permissionKeys: administrator.permissions.map(
        (grant) => grant.permission.key,
      ),
    };
  }
}
