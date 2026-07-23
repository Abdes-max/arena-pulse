import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Sport,
  Tournament,
  TournamentStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { DuplicateTournamentDto } from './dto/duplicate-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';

type TournamentWithSport = Tournament & { sport: Sport };

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateTournamentDto) {
    await this.assertSportExists(dto.sportId);
    const tournament = await this.prisma.tournament.create({
      data: {
        organizationId,
        sportId: dto.sportId,
        name: dto.name,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isOnline: dto.isOnline ?? false,
      },
      include: { sport: true },
    });
    return this.toDetail(tournament);
  }

  async list(organizationId: string, statusFilter?: string) {
    const status = this.parseStatusFilter(statusFilter);
    const tournaments = await this.prisma.tournament.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: { sport: true },
      orderBy: { createdAt: 'desc' },
    });
    return tournaments.map((tournament) => this.toSummary(tournament));
  }

  async getDetail(organizationId: string, tournamentId: string) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    return this.toDetail(tournament);
  }

  async update(
    organizationId: string,
    tournamentId: string,
    dto: UpdateTournamentDto,
  ) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);
    if (dto.sportId) {
      await this.assertSportExists(dto.sportId);
    }

    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        name: dto.name,
        sportId: dto.sportId,
        startDate:
          dto.startDate !== undefined
            ? dto.startDate
              ? new Date(dto.startDate)
              : null
            : undefined,
        endDate:
          dto.endDate !== undefined
            ? dto.endDate
              ? new Date(dto.endDate)
              : null
            : undefined,
        isOnline: dto.isOnline,
        teamsCanReferee: dto.teamsCanReferee,
      },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  async publish(organizationId: string, tournamentId: string) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);
    if (tournament.status === TournamentStatus.PUBLISHED) {
      throw new ConflictException('Ce tournoi est déjà publié.');
    }
    return this.setStatus(tournamentId, TournamentStatus.PUBLISHED);
  }

  async unpublish(organizationId: string, tournamentId: string) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);
    if (tournament.status !== TournamentStatus.PUBLISHED) {
      throw new ConflictException('Seul un tournoi publié peut être dépublié.');
    }
    return this.setStatus(tournamentId, TournamentStatus.UNPUBLISHED);
  }

  async archive(organizationId: string, tournamentId: string) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    if (tournament.status === TournamentStatus.ARCHIVED) {
      throw new ConflictException('Ce tournoi est déjà archivé.');
    }
    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: TournamentStatus.ARCHIVED, archivedAt: new Date() },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  async unarchive(organizationId: string, tournamentId: string) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    if (tournament.status !== TournamentStatus.ARCHIVED) {
      throw new ConflictException(
        'Seul un tournoi archivé peut être désarchivé.',
      );
    }
    // Always back to DRAFT — the previous status isn't remembered, matching
    // the rule that a duplicated tournament also always starts as DRAFT.
    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: TournamentStatus.DRAFT, archivedAt: null },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  async duplicate(
    organizationId: string,
    tournamentId: string,
    dto: DuplicateTournamentDto,
  ) {
    const source = await this.getOrThrow(organizationId, tournamentId);
    const newName = dto.name ?? `${source.name} (copie)`;

    const clone = await this.prisma.$transaction(async (tx) => {
      const newTournament = await tx.tournament.create({
        data: {
          organizationId,
          sportId: source.sportId,
          name: newName,
          startDate: source.startDate,
          endDate: source.endDate,
          isOnline: source.isOnline,
          status: TournamentStatus.DRAFT,
        },
      });

      const categories = await tx.category.findMany({
        where: { tournamentId: source.id },
        include: { divisions: true },
      });
      for (const category of categories) {
        const newCategory = await tx.category.create({
          data: {
            tournamentId: newTournament.id,
            name: category.name,
            position: category.position,
          },
        });
        for (const division of category.divisions) {
          await tx.division.create({
            data: {
              categoryId: newCategory.id,
              name: division.name,
              colorHex: division.colorHex,
              position: division.position,
            },
          });
        }
      }

      const administrators = await tx.tournamentAdministrator.findMany({
        where: { tournamentId: source.id },
        include: { permissions: true },
      });
      for (const administrator of administrators) {
        const newAdministrator = await tx.tournamentAdministrator.create({
          data: {
            tournamentId: newTournament.id,
            userId: administrator.userId,
          },
        });
        for (const grant of administrator.permissions) {
          await tx.tournamentAdministratorPermission.create({
            data: {
              tournamentAdministratorId: newAdministrator.id,
              permissionId: grant.permissionId,
            },
          });
        }
      }

      return newTournament;
    });

    return this.getDetail(organizationId, clone.id);
  }

  /** Used by the categories/divisions/administrators services before any write. */
  async assertTournamentIsEditable(
    organizationId: string,
    tournamentId: string,
  ): Promise<Tournament> {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);
    return tournament;
  }

  async assertTournamentExists(
    organizationId: string,
    tournamentId: string,
  ): Promise<Tournament> {
    return this.getOrThrow(organizationId, tournamentId);
  }

  private async getOrThrow(
    organizationId: string,
    tournamentId: string,
  ): Promise<TournamentWithSport> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { sport: true },
    });
    if (!tournament || tournament.organizationId !== organizationId) {
      throw new NotFoundException('Tournoi introuvable.');
    }
    return tournament;
  }

  private assertEditable(tournament: { status: TournamentStatus }): void {
    if (tournament.status === TournamentStatus.ARCHIVED) {
      throw new ConflictException(
        'Ce tournoi est archivé, désarchivez-le avant de le modifier.',
      );
    }
  }

  private async assertSportExists(sportId: string): Promise<void> {
    const sport = await this.prisma.sport.findUnique({
      where: { id: sportId },
    });
    if (!sport) {
      throw new BadRequestException('Sport introuvable.');
    }
  }

  private parseStatusFilter(
    statusFilter?: string,
  ): TournamentStatus | undefined {
    if (statusFilter === undefined) {
      return undefined;
    }
    if (
      !Object.values(TournamentStatus).includes(
        statusFilter as TournamentStatus,
      )
    ) {
      throw new BadRequestException(`Statut invalide : ${statusFilter}`);
    }
    return statusFilter as TournamentStatus;
  }

  private async setStatus(tournamentId: string, status: TournamentStatus) {
    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  private toSummary(tournament: TournamentWithSport) {
    return {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      sportId: tournament.sportId,
      sportName: tournament.sport.name,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      isOnline: tournament.isOnline,
      createdAt: tournament.createdAt,
    };
  }

  private toDetail(tournament: TournamentWithSport) {
    return {
      ...this.toSummary(tournament),
      organizationId: tournament.organizationId,
      archivedAt: tournament.archivedAt,
      updatedAt: tournament.updatedAt,
      teamsCanReferee: tournament.teamsCanReferee,
    };
  }
}
