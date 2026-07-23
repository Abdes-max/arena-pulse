import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, Division, Team } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { DivisionsService } from './divisions.service';
import { BulkDeleteTeamsDto } from './dto/bulk-delete-teams.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { parseTeamsCsv, serializeTeamsCsv } from './teams-csv.util';
import { TournamentsService } from './tournaments.service';

type TeamWithRelations = Team & {
  category: Category;
  division: Division | null;
};

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
    private readonly divisionsService: DivisionsService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    dto: CreateTeamDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const category = await this.categoriesService.assertCategoryExists(
      tournamentId,
      dto.categoryId,
    );
    const division = dto.divisionId
      ? await this.divisionsService.assertDivisionExists(
          category.id,
          dto.divisionId,
        )
      : null;
    await this.assertNameAvailable(tournamentId, dto.name);

    const team = await this.prisma.team.create({
      data: {
        tournamentId,
        categoryId: category.id,
        divisionId: division?.id,
        name: dto.name,
        managerName: dto.managerName,
        managerEmail: dto.managerEmail,
        managerPhone: dto.managerPhone,
      },
    });
    return this.toSummary({ ...team, category, division });
  }

  async list(
    organizationId: string,
    tournamentId: string,
    filters: { categoryId?: string; divisionId?: string },
  ) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const teams = await this.prisma.team.findMany({
      where: {
        tournamentId,
        categoryId: filters.categoryId,
        divisionId: filters.divisionId,
      },
      include: { category: true, division: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return teams.map((team) => this.toSummary(team));
  }

  async getOne(organizationId: string, tournamentId: string, teamId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const team = await this.getOrThrow(tournamentId, teamId);
    return this.toSummary(team);
  }

  async update(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    dto: UpdateTeamDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const team = await this.getOrThrow(tournamentId, teamId);
    if (dto.name && dto.name !== team.name) {
      await this.assertNameAvailable(tournamentId, dto.name, teamId);
    }

    const categoryId = dto.categoryId ?? team.categoryId;
    const category =
      dto.categoryId && dto.categoryId !== team.categoryId
        ? await this.categoriesService.assertCategoryExists(
            tournamentId,
            categoryId,
          )
        : team.category;

    let divisionId: string | null | undefined = undefined;
    let division: Division | null | undefined = undefined;
    if (dto.divisionId !== undefined) {
      if (dto.divisionId === '') {
        divisionId = null;
        division = null;
      } else {
        division = await this.divisionsService.assertDivisionExists(
          categoryId,
          dto.divisionId,
        );
        divisionId = division.id;
      }
    }

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        name: dto.name,
        categoryId: dto.categoryId ? categoryId : undefined,
        divisionId,
        managerName: dto.managerName,
        managerEmail: dto.managerEmail,
        managerPhone: dto.managerPhone,
      },
    });
    return this.toSummary({
      ...updated,
      category,
      division: division !== undefined ? division : team.division,
    });
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    teamId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrow(tournamentId, teamId);
    await this.prisma.team.delete({ where: { id: teamId } });
  }

  async bulkRemove(
    organizationId: string,
    tournamentId: string,
    dto: BulkDeleteTeamsDto,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.prisma.team.deleteMany({
      where: { tournamentId, id: { in: dto.teamIds } },
    });
  }

  /**
   * Not wrapped in a transaction on purpose: valid rows must be created even
   * when other rows in the same file are invalid (partial-success import).
   */
  async importFromCsv(
    organizationId: string,
    tournamentId: string,
    csv: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const { rows, errors } = parseTeamsCsv(csv);
    const created: ReturnType<TeamsService['toSummary']>[] = [];

    for (const row of rows) {
      const category = await this.prisma.category.findFirst({
        where: { tournamentId, name: row.categoryName },
      });
      if (!category) {
        errors.push({
          line: row.line,
          message: `Catégorie "${row.categoryName}" introuvable.`,
        });
        continue;
      }

      let division: Division | null = null;
      if (row.divisionName) {
        division = await this.prisma.division.findFirst({
          where: { categoryId: category.id, name: row.divisionName },
        });
        if (!division) {
          errors.push({
            line: row.line,
            message: `Division "${row.divisionName}" introuvable dans la catégorie "${row.categoryName}".`,
          });
          continue;
        }
      }

      const existing = await this.prisma.team.findFirst({
        where: { tournamentId, name: row.name },
      });
      if (existing) {
        errors.push({
          line: row.line,
          message: `Une équipe nommée "${row.name}" existe déjà.`,
        });
        continue;
      }

      const team = await this.prisma.team.create({
        data: {
          tournamentId,
          categoryId: category.id,
          divisionId: division?.id,
          name: row.name,
        },
      });
      created.push(this.toSummary({ ...team, category, division }));
    }

    return { created, errors };
  }

  async exportToCsv(
    organizationId: string,
    tournamentId: string,
  ): Promise<string> {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const teams = await this.prisma.team.findMany({
      where: { tournamentId },
      include: { category: true, division: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return serializeTeamsCsv(
      teams.map((team) => ({
        name: team.name,
        categoryName: team.category.name,
        divisionName: team.division?.name ?? null,
      })),
    );
  }

  /** Used by PlayersService to validate a teamId belongs to the tournament in the URL. */
  async assertTeamExists(tournamentId: string, teamId: string): Promise<Team> {
    return this.getOrThrow(tournamentId, teamId);
  }

  private async getOrThrow(
    tournamentId: string,
    teamId: string,
  ): Promise<TeamWithRelations> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { category: true, division: true },
    });
    if (!team || team.tournamentId !== tournamentId) {
      throw new NotFoundException('Équipe introuvable.');
    }
    return team;
  }

  private async assertNameAvailable(
    tournamentId: string,
    name: string,
    excludingTeamId?: string,
  ): Promise<void> {
    const existing = await this.prisma.team.findFirst({
      where: {
        tournamentId,
        name,
        ...(excludingTeamId ? { id: { not: excludingTeamId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Une équipe porte déjà ce nom pour ce tournoi.',
      );
    }
  }

  private toSummary(team: TeamWithRelations) {
    return {
      id: team.id,
      name: team.name,
      categoryId: team.categoryId,
      categoryName: team.category.name,
      divisionId: team.divisionId,
      divisionName: team.division?.name ?? null,
      managerName: team.managerName,
      managerEmail: team.managerEmail,
      managerPhone: team.managerPhone,
      position: team.position,
    };
  }
}
